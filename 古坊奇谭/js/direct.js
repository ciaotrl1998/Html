// Bundled into runtime.js, including offline QR generation and image decoding.
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { deflateSync, inflateSync, strToU8, strFromU8 } = require('fflate');

(function () {
  'use strict';
  const PREFIX = 'GF-DIRECT-1:', MAX_PACKET = 1000000;
  function pack(value) {
    const bytes = deflateSync(strToU8(JSON.stringify(value)));
    return PREFIX + btoa(String.fromCharCode(...bytes));
  }
  function unpack(text) {
    try {
      text = String(text).replace(/\s/g, '');
      if (!text.startsWith(PREFIX) || text.length > 16000) throw new Error();
      const bytes = Uint8Array.from(atob(text.slice(PREFIX.length)), c => c.charCodeAt(0));
      const value = JSON.parse(strFromU8(inflateSync(bytes, { out: new Uint8Array(20000) })));
      if (value.v !== 1 || !/^[a-f0-9]{24}$/.test(value.id) || !['offer', 'answer'].includes(value.type) ||
          typeof value.sdp !== 'string' || value.sdp.length > 18000 || !value.sdp.startsWith('v=0')) throw new Error();
      return value;
    } catch { throw new Error('配对码无效，请完整复制邀请／回应码，或重新拍摄二维码'); }
  }
  async function gathered(pc) {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('网络地址收集超时，请检查 Wi-Fi 或热点后重试')), 12000);
      const check = () => { if (pc.iceGatheringState === 'complete') done(); else if (pc.signalingState === 'closed') done(new Error('配对已取消')); };
      function done(error) { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); pc.removeEventListener('signalingstatechange', check); error ? reject(error) : resolve(); }
      pc.addEventListener('icegatheringstatechange', check); pc.addEventListener('signalingstatechange', check); check();
    });
  }
  function create(role, handlers = {}) {
    if (!window.RTCPeerConnection) throw new Error('此浏览器不支持手机直连，请换用支持 WebRTC 的完整浏览器');
    // Host candidates only: no signaling service, STUN, TURN, or internet dependency.
    const pc = new RTCPeerConnection({ iceServers: [] });
    let id = Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
    let channel, connectionTimer, closed = false, sequence = 0, received = null, lastSeen = performance.now(), available = false;
    const status = text => { if (!closed) handlers.status?.(text); };
    const connected = value => { if (available !== value && !closed) { available = value; handlers.connected?.(value); } };
    const transport = {
      get readyState() { return channel?.readyState === 'open' && !closed ? 1 : closed ? 3 : 0; },
      get bufferedAmount() { return channel?.bufferedAmount || 0; },
      send(text) {
        if (transport.readyState !== 1) return;
        if (typeof text !== 'string' || text.length > MAX_PACKET) throw new Error('同步消息过大');
        // Conservative frames also work with browsers whose SCTP message limit is 64 KiB.
        const frameId = ++sequence, count = Math.ceil(text.length / 10000);
        for (let i = 0; i < count; i++) channel.send(JSON.stringify({ id: frameId, i, count, text: text.slice(i * 10000, (i + 1) * 10000) }));
      },
      close() { if (closed) return; closed = true; clearInterval(heartbeat); clearTimeout(connectionTimer); channel?.close(); pc.close(); }
    };
    function wire(next) {
      channel = next;
      channel.onopen = () => { clearTimeout(connectionTimer); lastSeen = performance.now(); connected(true); status('两部手机已直连，可以开始合作'); };
      channel.onclose = () => { connected(false); status('直连已断开，请重新配对'); };
      channel.onerror = () => { connected(false); status('连接异常，请检查 Wi-Fi／热点'); };
      channel.onmessage = event => {
        if (closed || typeof event.data !== 'string' || event.data.length > 65000) return;
        let part; try { part = JSON.parse(event.data); } catch { return; }
        lastSeen = performance.now();
        if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') connected(true);
        if (part.ping) { channel.send('{"pong":true}'); return; }
        if (part.pong) return;
        if (!Number.isSafeInteger(part.id) || !Number.isInteger(part.i) || !Number.isInteger(part.count) || part.count < 1 || part.count > 100 || part.i < 0 || part.i >= part.count || typeof part.text !== 'string' || part.text.length > 10000) return;
        if (part.i === 0) received = { id: part.id, count: part.count, pieces: [], size: 0 };
        if (!received || received.id !== part.id || received.count !== part.count || received.pieces.length !== part.i) return;
        received.pieces.push(part.text); received.size += part.text.length;
        if (received.size > MAX_PACKET) { received = null; return; }
        if (received.pieces.length === part.count) {
          const raw = received.pieces.join(''); received = null;
          let message; try { message = JSON.parse(raw); } catch { return; }
          if (message && typeof message === 'object') handlers.message?.(message);
        }
      };
    }
    if (role === 'host') wire(pc.createDataChannel('gufang', { ordered: true }));
    else pc.ondatachannel = event => wire(event.channel);
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { connected(false); status('连接中断，已暂停等待恢复；无法恢复时请重新配对'); }
      else if (pc.connectionState === 'connected' && channel?.readyState === 'open') { lastSeen = performance.now(); connected(true); }
    };
    const heartbeat = setInterval(() => {
      if (transport.readyState !== 1) return;
      if (performance.now() - lastSeen > 8000) { connected(false); status('暂未收到队友回应，等待连接恢复'); }
      if (channel.bufferedAmount < 50000) channel.send('{"ping":true}');
    }, 2000);
    async function localCode() {
      await gathered(pc);
      if (closed) throw new Error('配对已取消');
      if (!/a=candidate:/.test(pc.localDescription.sdp)) throw new Error('未找到可用的本地网络地址，请连接 Wi-Fi／热点并检查浏览器本地网络权限');
      return pack({ v: 1, id, type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    }
    return {
      transport,
      async offer() { await pc.setLocalDescription(await pc.createOffer()); return localCode(); },
      async answer(text) {
        const offer = unpack(text);
        if (offer.type !== 'offer') throw new Error('这里需要主机的邀请二维码／邀请配对码');
        id = offer.id;
        await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
        await pc.setLocalDescription(await pc.createAnswer()); return localCode();
      },
      async accept(text) {
        const answer = unpack(text);
        if (answer.type !== 'answer' || answer.id !== id) throw new Error('回应码与当前邀请不匹配，请使用本次邀请生成的回应码');
        await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
        status('配对信息已交换，正在连接两部手机…');
        clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => { if (!available) status('尚未连通。请确认两机处于同一 Wi-Fi／热点并允许本地网络访问；若热点限制互访，请尝试同一 Wi-Fi 后重新配对。'); }, 20000);
      }
    };
  }
  async function readImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取图片，请使用清晰的二维码照片或截图')); image.src = url; });
      const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(data.data, data.width, data.height);
      if (!result) throw new Error('未识别到二维码，请靠近拍摄、保持清晰并包含四周白边');
      unpack(result.data); return result.data;
    } finally { URL.revokeObjectURL(url); }
  }
  window.GFDirect = { create, unpack, readImage, qr: code => QRCode.toDataURL(code, { errorCorrectionLevel: 'L', width: 720, margin: 4 }) };
})();
