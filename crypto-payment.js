/**
 * AL-MUDIR Crypto Payment Manager v2.1
 * Fixes: Buffer dependency removed, BigInt safe, TRON support,
 *        proper wallet deep-links, network auto-switch, gift card persistence
 */
(function (global) {
  'use strict';

  class CryptoPaymentManager {
    constructor() {
      this.walletConnected = false;
      this.account  = null;
      this.chainId  = null;
      this.serviceFeeUSD = 5.00;

      this.treasuryNativeAddress = {
        1:   '0x3b8BAdeCEbB98258F27405a8Dff37e2308AB6E20',
        56:  '0x3b8BAdeCEbB98258F27405a8Dff37e2308AB6E20',
        195: 'TLNNQNDsH6JG9dxd99Tqfkb8eSPRUyhC4E',
      };
      this.treasuryUSDTAddress = {
        1:   '0x3b8BAdeCEbB98258F27405a8Dff37e2308AB6E20',
        56:  '0x3b8BAdeCEbB98258F27405a8Dff37e2308AB6E20',
        195: 'TLNNQNDsH6JG9dxd99Tqfkb8eSPRUyhC4E',
      };
      this.btcAddress = 'bc1qfe8kjaau2n2ggknmx6a8gclzwc9xz3zpj0lcsp';

      this.usdtContracts = {
        1:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        56: '0x55d398326f99059fF775485246999027B3197955',
      };

      this.supportedChains = {
        1:   { name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io/tx/' },
        56:  { name: 'BSC',      symbol: 'BNB', explorer: 'https://bscscan.com/tx/' },
        195: { name: 'TRON',     symbol: 'TRX', explorer: 'https://tronscan.org/#/transaction/' },
      };

      this.paymentRates = {
        ETH: 3500, BNB: 600, USDT: 1, USDC: 1,
        TRX: 0.13, BTC: 65000, ADA: 0.45, SOL: 170,
        DOT: 7, LINK: 14, UNI: 7, USD: 1,
        EUR: 1.08, GBP: 1.27, AED: 0.27, JPY: 0.0067,
        CHF: 1.12, CAD: 0.73, AUD: 0.65, CNY: 0.14,
        INR: 0.012, BRL: 0.2, ZAR: 0.055,
      };

      this.giftCards = {
        'ALMUDIR-GIFT-50':  50,
        'ALMUDIR-GIFT-100': 100,
        'ALMUDIR-GIFT-250': 250,
      };

      try {
        this.usedGiftCards = new Set(JSON.parse(localStorage.getItem('almudir_used_gifts') || '[]'));
      } catch (_) {
        this.usedGiftCards = new Set();
      }
    }

    /* ── Helpers ──────────────────────────────────────── */
    _isMobile() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); }

    _hexEncode(str) {
      return '0x' + Array.from(new TextEncoder().encode(str))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    _toWeiHex(amount) {
      const wei = Math.round(amount * 1e18);
      return '0x' + BigInt(wei).toString(16);
    }

    /* ── Wallet connect ───────────────────────────────── */
    async connectWallet(preferredWallet) {
      if (!window.ethereum) {
        if (this._isMobile()) {
          const url  = encodeURIComponent(window.location.href);
          const link = preferredWallet === 'trustwallet'
            ? `trust://open_url?coin_id=60&url=${url}`
            : `https://metamask.app.link/dapp/${window.location.hostname}`;
          window.open(link, '_blank');
          throw new Error('Opening wallet app — return after connecting.');
        }
        const name = preferredWallet === 'trustwallet' ? 'Trust Wallet' : 'MetaMask';
        throw new Error(`${name} not detected. Please install it and refresh.`);
      }

      try {
        const accounts  = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const chainHex  = await window.ethereum.request({ method: 'eth_chainId' });
        this.account     = accounts[0];
        this.chainId     = parseInt(chainHex, 16);
        this.walletConnected = true;

        window.ethereum.on('accountsChanged', (a) => {
          this.account        = a[0] || null;
          this.walletConnected = Boolean(a[0]);
          window.dispatchEvent(new CustomEvent('almudir:walletAccount', { detail: { account: this.account } }));
        });
        window.ethereum.on('chainChanged', (c) => {
          this.chainId = parseInt(c, 16);
          window.dispatchEvent(new CustomEvent('almudir:walletChain', { detail: { chainId: this.chainId } }));
        });

        return {
          account:   this.account,
          chainId:   this.chainId,
          chainName: this.supportedChains[this.chainId]?.name || `Chain ${this.chainId}`,
        };
      } catch (err) {
        if (err.code === 4001) throw new Error('Connection rejected. Approve in your wallet.');
        throw err;
      }
    }

    disconnectWallet() {
      this.walletConnected = false;
      this.account = null;
      this.chainId = null;
    }

    async getBalance() {
      if (!this.walletConnected) throw new Error('Wallet not connected.');
      const hex = await window.ethereum.request({ method: 'eth_getBalance', params: [this.account, 'latest'] });
      return (parseInt(hex, 16) / 1e18).toFixed(6);
    }

    /* ── Payments ─────────────────────────────────────── */
    async processPayment({ amount, currency, recipientAddress, description = '' }) {
      if (!this.walletConnected) throw new Error('Wallet not connected.');
      if (!recipientAddress)     throw new Error('No treasury address for this network.');
      if (currency === 'USDT') return this._sendERC20(recipientAddress, amount);
      return this._sendNative(recipientAddress, amount, description);
    }

    async _sendNative(to, amount, description) {
      const value = this._toWeiHex(amount);
      const data  = description ? this._hexEncode(description) : '0x';
      const hash  = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: this.account, to, value, data }],
      });
      return { transactionHash: hash, status: 'pending' };
    }

    async _sendERC20(to, amount) {
      const contract = this.usdtContracts[this.chainId];
      if (!contract) throw new Error('USDT not supported on this network. Use Ethereum or BSC.');
      const units    = BigInt(Math.round(amount * 1e6)); // USDT = 6 decimals
      const methodId = '0xa9059cbb';
      const addrPad  = to.replace('0x', '').toLowerCase().padStart(64, '0');
      const valPad   = units.toString(16).padStart(64, '0');
      const hash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: this.account, to: contract, data: methodId + addrPad + valPad }],
      });
      return { transactionHash: hash, status: 'pending' };
    }

    async processCardPayment({ usdAmount, cardLast4 }) {
      await new Promise(r => setTimeout(r, 1800));
      return {
        usdtAmount:   usdAmount,
        txReference:  'CARD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        cardLast4,
        status: 'authorized',
      };
    }

    validateGiftCard(code) {
      const key = code.trim().toUpperCase();
      if (this.usedGiftCards.has(key)) throw new Error('Gift card already redeemed.');
      const value = this.giftCards[key];
      if (!value) throw new Error('Invalid gift card code.');
      this.usedGiftCards.add(key);
      try { localStorage.setItem('almudir_used_gifts', JSON.stringify([...this.usedGiftCards])); } catch (_) {}
      return value;
    }

    /* ── Rates ────────────────────────────────────────── */
    calculateUSD(amount, currency) { return amount * (this.paymentRates[currency] || 1); }
    convertToUSDT(amount, currency) { return this.calculateUSD(amount, currency); }

    async convertCurrency(amount, from, to) {
      if (from === to) return amount;
      try {
        const [fUSD, tUSD] = await Promise.all([this._rateToUSD(from), this._rateToUSD(to)]);
        return (amount * fUSD) / tUSD;
      } catch (_) {
        return amount * (this.paymentRates[from] || 1) / (this.paymentRates[to] || 1);
      }
    }

    async _rateToUSD(currency) {
      if (currency === 'USD') return 1;
      const cryptoIds = {
        BTC:'bitcoin', ETH:'ethereum', BNB:'binancecoin',
        USDT:'tether', USDC:'usd-coin', ADA:'cardano',
        SOL:'solana',  DOT:'polkadot', LINK:'chainlink', UNI:'uniswap',
      };
      if (cryptoIds[currency]) {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds[currency]}&vs_currencies=usd`);
        const d = await r.json();
        return d[cryptoIds[currency]]?.usd || this.paymentRates[currency] || 1;
      }
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const d = await r.json();
      return d.rates[currency] ? (1 / d.rates[currency]) : (this.paymentRates[currency] || 1);
    }

    async switchNetwork(chainId) {
      const hex = '0x' + chainId.toString(16);
      const adds = {
        56: { chainId:'0x38', chainName:'Binance Smart Chain', rpcUrls:['https://bsc-dataseed.binance.org/'], nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18}, blockExplorerUrls:['https://bscscan.com'] },
      };
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
        this.chainId = chainId;
      } catch (e) {
        if (e.code === 4902 && adds[chainId]) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [adds[chainId]] });
          this.chainId = chainId;
        } else throw e;
      }
    }
  }

  global.CryptoPaymentManager = CryptoPaymentManager;

}(typeof window !== 'undefined' ? window : this));
