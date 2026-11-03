// Self-contained crypto helpers (no native modules): base64, utf8, MD5,
// SHA-1, SHA-256, HMAC, AES (CBC / CTR / GCM-decrypt / ECB), EVP_BytesToKey.
// Byte arrays are Uint8Array everywhere.

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_LOOKUP = (function () {
  var t = {};
  for (var i = 0; i < 64; i++) t[B64_CHARS.charAt(i)] = i;
  t["-"] = 62; t["_"] = 63;
  return t;
})();

function b64ToBytes(s) {
  s = String(s || "").replace(/[\s=]/g, "");
  var out = new Uint8Array(Math.floor(s.length * 3 / 4));
  var buf = 0, bits = 0, n = 0;
  for (var i = 0; i < s.length; i++) {
    var v = B64_LOOKUP[s.charAt(i)];
    if (v === undefined) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[n++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, n);
}

function bytesToB64(bytes, urlSafe, noPad) {
  var out = "", i;
  for (i = 0; i + 2 < bytes.length; i += 3) {
    var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_CHARS.charAt((n >> 18) & 63) + B64_CHARS.charAt((n >> 12) & 63) + B64_CHARS.charAt((n >> 6) & 63) + B64_CHARS.charAt(n & 63);
  }
  var rem = bytes.length - i;
  if (rem === 1) {
    var a = bytes[i] << 16;
    out += B64_CHARS.charAt((a >> 18) & 63) + B64_CHARS.charAt((a >> 12) & 63) + "==";
  } else if (rem === 2) {
    var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_CHARS.charAt((b >> 18) & 63) + B64_CHARS.charAt((b >> 12) & 63) + B64_CHARS.charAt((b >> 6) & 63) + "=";
  }
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  if (noPad || urlSafe) out = out.replace(/=+$/, "");
  return out;
}

function utf8Encode(str) {
  str = String(str);
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      var c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  var s = "", i = 0;
  while (i < bytes.length) {
    var b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if ((b & 0xe0) === 0xc0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 63));
    else if ((b & 0xf0) === 0xe0) { s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)); }
    else if ((b & 0xf8) === 0xf0) {
      var cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      cp -= 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else s += String.fromCharCode(b);
  }
  return s;
}

function latin1Bytes(str) {
  var out = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function bytesToLatin1(b) {
  var s = "";
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function hexToBytes(hex) {
  hex = String(hex).replace(/[^0-9a-f]/gi, "");
  var out = new Uint8Array(hex.length >> 1);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(b) {
  var s = "";
  for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
}

function toBytes(x) {
  if (x instanceof Uint8Array) return x;
  if (Array.isArray(x)) return new Uint8Array(x);
  return utf8Encode(x);
}

function concatBytes() {
  var len = 0, i;
  for (i = 0; i < arguments.length; i++) len += arguments[i].length;
  var out = new Uint8Array(len), off = 0;
  for (i = 0; i < arguments.length; i++) { out.set(arguments[i], off); off += arguments[i].length; }
  return out;
}

function b64decodeString(s) { return utf8Decode(b64ToBytes(s)); }
function b64encodeString(s, urlSafe) { return bytesToB64(utf8Encode(s), urlSafe); }

// ---------------- MD5 ----------------
function md5Bytes(input) {
  var msg = toBytes(input);
  var K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  var ml = msg.length;
  var withPad = new Uint8Array(((ml + 8) >> 6) * 64 + 64);
  withPad.set(msg);
  withPad[ml] = 0x80;
  var bitLen = ml * 8;
  withPad[withPad.length - 8] = bitLen & 0xff;
  withPad[withPad.length - 7] = (bitLen >>> 8) & 0xff;
  withPad[withPad.length - 6] = (bitLen >>> 16) & 0xff;
  withPad[withPad.length - 5] = (bitLen >>> 24) & 0xff;
  withPad[withPad.length - 4] = Math.floor(ml / 536870912) & 0xff;
  var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  var M = new Int32Array(16);
  for (var off = 0; off < withPad.length; off += 64) {
    for (var j = 0; j < 16; j++) M[j] = withPad[off + j * 4] | (withPad[off + j * 4 + 1] << 8) | (withPad[off + j * 4 + 2] << 16) | (withPad[off + j * 4 + 3] << 24);
    var A = a0, B = b0, C = c0, D = d0;
    for (var k = 0; k < 64; k++) {
      var F, g;
      if (k < 16) { F = (B & C) | (~B & D); g = k; }
      else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
      else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * k) % 16; }
      F = (F + A + K[k] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[k]) | (F >>> (32 - S[k])))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  var out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach(function (v, idx) {
    out[idx * 4] = v & 0xff; out[idx * 4 + 1] = (v >>> 8) & 0xff; out[idx * 4 + 2] = (v >>> 16) & 0xff; out[idx * 4 + 3] = (v >>> 24) & 0xff;
  });
  return out;
}
function md5Hex(input) { return bytesToHex(md5Bytes(input)); }

// ---------------- SHA-1 / SHA-256 ----------------
function shaPad(msg) {
  var ml = msg.length;
  var out = new Uint8Array(((ml + 8) >> 6) * 64 + 64);
  out.set(msg);
  out[ml] = 0x80;
  var bitLenHi = Math.floor(ml / 536870912), bitLenLo = (ml * 8) >>> 0;
  var n = out.length;
  out[n - 8] = (bitLenHi >>> 24) & 0xff; out[n - 7] = (bitLenHi >>> 16) & 0xff; out[n - 6] = (bitLenHi >>> 8) & 0xff; out[n - 5] = bitLenHi & 0xff;
  out[n - 4] = (bitLenLo >>> 24) & 0xff; out[n - 3] = (bitLenLo >>> 16) & 0xff; out[n - 2] = (bitLenLo >>> 8) & 0xff; out[n - 1] = bitLenLo & 0xff;
  return out;
}

function wordsToBytes(words) {
  var out = new Uint8Array(words.length * 4);
  for (var i = 0; i < words.length; i++) {
    out[i * 4] = (words[i] >>> 24) & 0xff; out[i * 4 + 1] = (words[i] >>> 16) & 0xff; out[i * 4 + 2] = (words[i] >>> 8) & 0xff; out[i * 4 + 3] = words[i] & 0xff;
  }
  return out;
}

function sha1Bytes(input) {
  var m = shaPad(toBytes(input));
  var h = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
  var w = new Int32Array(80);
  for (var off = 0; off < m.length; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
    for (i = 16; i < 80; i++) { var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc | 0; }
      else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
      var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
  }
  return wordsToBytes(h);
}

var SHA256_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

function sha256Bytes(input) {
  var m = shaPad(toBytes(input));
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19].map(function (x) { return x | 0; });
  var w = new Int32Array(64);
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  for (var off = 0; off < m.length; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
    for (i = 16; i < 64; i++) {
      var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (hh + S1 + ch + (SHA256_K[i] | 0) + w[i]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return wordsToBytes(h);
}
function sha256Hex(input) { return bytesToHex(sha256Bytes(input)); }
function sha1Hex(input) { return bytesToHex(sha1Bytes(input)); }

function hmac(hashFn, key, msg) {
  key = toBytes(key); msg = toBytes(msg);
  if (key.length > 64) key = hashFn(key);
  var k = new Uint8Array(64); k.set(key);
  var ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  return hashFn(concatBytes(opad, hashFn(concatBytes(ipad, msg))));
}
function hmacSha256(key, msg) { return hmac(sha256Bytes, key, msg); }
function hmacSha1(key, msg) { return hmac(sha1Bytes, key, msg); }
function hmacMd5(key, msg) { return hmac(md5Bytes, key, msg); }

// ---------------- AES ----------------
var AES_SBOX = new Uint8Array(256), AES_INV_SBOX = new Uint8Array(256);
(function () {
  var p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    x = (x ^ 0x63) & 0xff;
    AES_SBOX[p] = x; AES_INV_SBOX[x] = p;
  } while (p !== 1);
  AES_SBOX[0] = 0x63; AES_INV_SBOX[0x63] = 0;
})();

function gmul(a, b) {
  var p = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function aesExpandKey(key) {
  key = toBytes(key);
  var nk = key.length / 4, nr = nk + 6;
  var w = new Uint8Array(16 * (nr + 1));
  w.set(key);
  var rcon = 1;
  for (var i = nk; i < 4 * (nr + 1); i++) {
    var t0 = w[(i - 1) * 4], t1 = w[(i - 1) * 4 + 1], t2 = w[(i - 1) * 4 + 2], t3 = w[(i - 1) * 4 + 3];
    if (i % nk === 0) {
      var tmp = t0;
      t0 = AES_SBOX[t1] ^ rcon; t1 = AES_SBOX[t2]; t2 = AES_SBOX[t3]; t3 = AES_SBOX[tmp];
      rcon = gmul(rcon, 2);
    } else if (nk > 6 && i % nk === 4) {
      t0 = AES_SBOX[t0]; t1 = AES_SBOX[t1]; t2 = AES_SBOX[t2]; t3 = AES_SBOX[t3];
    }
    w[i * 4] = w[(i - nk) * 4] ^ t0; w[i * 4 + 1] = w[(i - nk) * 4 + 1] ^ t1;
    w[i * 4 + 2] = w[(i - nk) * 4 + 2] ^ t2; w[i * 4 + 3] = w[(i - nk) * 4 + 3] ^ t3;
  }
  return { w: w, nr: nr };
}

function aesEncryptBlock(ks, input) {
  var s = new Uint8Array(input), w = ks.w, nr = ks.nr, i, c;
  for (i = 0; i < 16; i++) s[i] ^= w[i];
  for (var r = 1; r <= nr; r++) {
    for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    var t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
    if (r !== nr) {
      for (c = 0; c < 4; c++) {
        var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
        s[c * 4] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
        s[c * 4 + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
        s[c * 4 + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
        s[c * 4 + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
      }
    }
    for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}

function aesDecryptBlock(ks, input) {
  var s = new Uint8Array(input), w = ks.w, nr = ks.nr, i, c;
  for (i = 0; i < 16; i++) s[i] ^= w[nr * 16 + i];
  for (var r = nr - 1; r >= 0; r--) {
    var t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
    for (i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
    for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    if (r !== 0) {
      for (c = 0; c < 4; c++) {
        var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
        s[c * 4] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        s[c * 4 + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        s[c * 4 + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        s[c * 4 + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
      }
    }
  }
  return s;
}

function pkcs7Unpad(b) {
  if (!b.length) return b;
  var n = b[b.length - 1];
  if (n < 1 || n > 16 || n > b.length) return b;
  for (var i = b.length - n; i < b.length; i++) if (b[i] !== n) return b;
  return b.subarray(0, b.length - n);
}

function pkcs7Pad(b) {
  var n = 16 - (b.length % 16);
  var out = new Uint8Array(b.length + n);
  out.set(b);
  for (var i = b.length; i < out.length; i++) out[i] = n;
  return out;
}

function aesCbcDecrypt(data, key, iv, noUnpad) {
  data = toBytes(data);
  var ks = aesExpandKey(key), prev = toBytes(iv).subarray(0, 16);
  var out = new Uint8Array(data.length - (data.length % 16));
  for (var off = 0; off + 16 <= data.length; off += 16) {
    var block = data.subarray(off, off + 16);
    var dec = aesDecryptBlock(ks, block);
    for (var i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
    prev = block;
  }
  return noUnpad ? out : pkcs7Unpad(out);
}

function aesCbcEncrypt(data, key, iv) {
  data = pkcs7Pad(toBytes(data));
  var ks = aesExpandKey(key), prev = toBytes(iv).subarray(0, 16);
  var out = new Uint8Array(data.length);
  for (var off = 0; off < data.length; off += 16) {
    var block = new Uint8Array(16);
    for (var i = 0; i < 16; i++) block[i] = data[off + i] ^ prev[i];
    prev = aesEncryptBlock(ks, block);
    out.set(prev, off);
  }
  return out;
}

function aesEcbDecrypt(data, key, noUnpad) {
  data = toBytes(data);
  var ks = aesExpandKey(key);
  var out = new Uint8Array(data.length - (data.length % 16));
  for (var off = 0; off + 16 <= data.length; off += 16) out.set(aesDecryptBlock(ks, data.subarray(off, off + 16)), off);
  return noUnpad ? out : pkcs7Unpad(out);
}

// CTR with a full 16-byte initial counter block (big-endian increment of the last 4 bytes)
function aesCtr(data, key, counterBlock) {
  data = toBytes(data);
  var ks = aesExpandKey(key);
  var ctr = new Uint8Array(toBytes(counterBlock));
  var out = new Uint8Array(data.length);
  for (var off = 0; off < data.length; off += 16) {
    var ksb = aesEncryptBlock(ks, ctr);
    for (var i = 0; i < 16 && off + i < data.length; i++) out[off + i] = data[off + i] ^ ksb[i];
    for (var j = 15; j >= 12; j--) { ctr[j] = (ctr[j] + 1) & 0xff; if (ctr[j] !== 0) break; }
  }
  return out;
}

// AES-GCM decrypt without tag verification (12 byte iv). data = ciphertext (tag stripped)
function aesGcmDecrypt(data, key, iv) {
  iv = toBytes(iv);
  var j0 = new Uint8Array(16);
  j0.set(iv.subarray(0, 12));
  j0[15] = 2; // counter starts at 2 for the first ciphertext block
  return aesCtr(data, key, j0);
}

// OpenSSL "Salted__" + EVP_BytesToKey(MD5) as used by CryptoJS passphrase mode
function evpBytesToKey(pass, salt, keyLen, ivLen) {
  pass = toBytes(pass);
  var out = new Uint8Array(0), prev = new Uint8Array(0);
  while (out.length < keyLen + ivLen) {
    prev = md5Bytes(concatBytes(prev, pass, salt));
    out = concatBytes(out, prev);
  }
  return { key: out.subarray(0, keyLen), iv: out.subarray(keyLen, keyLen + ivLen) };
}

function cryptoJsAesDecrypt(b64Cipher, passphrase) {
  var raw = b64ToBytes(b64Cipher);
  if (bytesToLatin1(raw.subarray(0, 8)) !== "Salted__") return null;
  var salt = raw.subarray(8, 16);
  var kv = evpBytesToKey(passphrase, salt, 32, 16);
  return utf8Decode(aesCbcDecrypt(raw.subarray(16), kv.key, kv.iv));
}

function xorBytes(data, key) {
  data = toBytes(data); key = toBytes(key);
  var out = new Uint8Array(data.length);
  for (var i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

function randomHex(n) {
  var s = "";
  for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
