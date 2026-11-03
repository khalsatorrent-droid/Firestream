// Minimal DEFLATE decoder (raw / zlib / gzip) — enough for API payloads.

function inflateRaw(data) {
  var out = [], pos = 0, bitBuf = 0, bitCnt = 0;
  function bits(n) {
    while (bitCnt < n) {
      if (pos >= data.length) throw new Error("inflate: eof");
      bitBuf |= data[pos++] << bitCnt; bitCnt += 8;
    }
    var v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n; bitCnt -= n;
    return v;
  }
  function buildTree(lengths) {
    var counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(lengths.length), i;
    for (i = 0; i < lengths.length; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    for (i = 0; i < lengths.length; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
    return { counts: counts, syms: syms };
  }
  function decodeSym(t) {
    var code = 0, first = 0, index = 0;
    for (var len = 1; len < 16; len++) {
      code |= bits(1);
      var count = t.counts[len];
      if (code - count < first) return t.syms[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error("inflate: bad code");
  }
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var fixedL, fixedD;
  (function () {
    var l = new Uint8Array(288), i;
    for (i = 0; i < 144; i++) l[i] = 8;
    for (; i < 256; i++) l[i] = 9;
    for (; i < 280; i++) l[i] = 7;
    for (; i < 288; i++) l[i] = 8;
    fixedL = buildTree(l);
    var d = new Uint8Array(30); for (i = 0; i < 30; i++) d[i] = 5;
    fixedD = buildTree(d);
  })();
  var final = 0;
  while (!final) {
    final = bits(1);
    var type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      var len = data[pos] | (data[pos + 1] << 8); pos += 4;
      for (var k = 0; k < len; k++) out.push(data[pos++]);
      continue;
    }
    var lt, dt;
    if (type === 1) { lt = fixedL; dt = fixedD; }
    else if (type === 2) {
      var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      var ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
      var cl = new Uint8Array(19);
      for (var c = 0; c < hclen; c++) cl[ORDER[c]] = bits(3);
      var clt = buildTree(cl);
      var lens = new Uint8Array(hlit + hdist), n = 0;
      while (n < hlit + hdist) {
        var sym = decodeSym(clt);
        if (sym < 16) lens[n++] = sym;
        else if (sym === 16) { var prev = lens[n - 1], r = 3 + bits(2); while (r--) lens[n++] = prev; }
        else if (sym === 17) { var z = 3 + bits(3); while (z--) lens[n++] = 0; }
        else { var z2 = 11 + bits(7); while (z2--) lens[n++] = 0; }
      }
      lt = buildTree(lens.subarray(0, hlit));
      dt = buildTree(lens.subarray(hlit));
    } else throw new Error("inflate: bad block");
    for (;;) {
      var s = decodeSym(lt);
      if (s < 256) out.push(s);
      else if (s === 256) break;
      else {
        s -= 257;
        var length = LBASE[s] + bits(LEXT[s]);
        var ds = decodeSym(dt);
        var dist = DBASE[ds] + bits(DEXT[ds]);
        var start = out.length - dist;
        for (var m = 0; m < length; m++) out.push(out[start + m]);
      }
    }
  }
  return new Uint8Array(out);
}

// auto-detect gzip / zlib / raw
function inflateAuto(data) {
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    var flg = data[3], p = 10;
    if (flg & 4) p += 2 + (data[p] | (data[p + 1] << 8));
    if (flg & 8) { while (data[p]) p++; p++; }
    if (flg & 16) { while (data[p]) p++; p++; }
    if (flg & 2) p += 2;
    return inflateRaw(data.subarray(p));
  }
  var isZlib = data.length > 1 && (data[0] & 0x0f) === 8 && (data[0] >> 4) <= 7 && (((data[0] << 8) | data[1]) % 31 === 0);
  return inflateRaw(isZlib ? data.subarray(2) : data);
}
