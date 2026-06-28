/*
 * Adaptador NORU para QR Code.
 * Expõe window.QRCode.toCanvas(canvas, texto, opts, callback) usando a lib
 * vendorizada `qrcode-generator` (global `qrcode`). Mantém a mesma assinatura
 * que o painel admin já consome, desenhando direto no <canvas> existente
 * (preserva o download em PNG via canvas.toDataURL).
 */
(function () {
  'use strict';

  function toCanvas(canvas, text, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};

    try {
      if (typeof window.qrcode !== 'function') {
        throw new Error('Biblioteca de QR Code não carregada.');
      }

      var level = String(opts.errorCorrectionLevel || 'M').toUpperCase();
      var qr = window.qrcode(0, level); // tipo 0 = ajuste automático ao conteúdo
      qr.addData(text == null ? '' : String(text));
      qr.make();

      var count = qr.getModuleCount();
      var margin = opts.margin == null ? 4 : Math.max(0, opts.margin);
      var dark = (opts.color && opts.color.dark) || '#000000';
      var light = (opts.color && opts.color.light) || '#ffffff';

      var totalModules = count + margin * 2;
      var requested = opts.width || 220;
      var cell = Math.max(1, Math.floor(requested / totalModules));
      var size = cell * totalModules;

      var dpr = window.devicePixelRatio || 1;
      var ctx = canvas.getContext('2d');
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = light;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = dark;
      for (var row = 0; row < count; row++) {
        for (var col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
          }
        }
      }

      if (typeof callback === 'function') callback(null, canvas);
      return canvas;
    } catch (err) {
      if (typeof callback === 'function') {
        callback(err);
        return;
      }
      throw err;
    }
  }

  window.QRCode = window.QRCode || {};
  window.QRCode.toCanvas = toCanvas;
})();
