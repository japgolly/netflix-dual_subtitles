const fs = require('fs');

// Simple PNG generator in pure Node.js (raw PNG creation with zlib)
const zlib = require('zlib');

function createPng(width, height, r, g, b) {
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b, 255);
    }
  }

  const buffer = Buffer.from(rawData);
  const compressed = zlib.deflateSync(buffer);

  function writeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // Simple CRC32 implementation
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = writeChunk('IHDR', ihdrData);
  const idatChunk = writeChunk('IDAT', compressed);
  const iendChunk = writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Generate Red Netflix icons
fs.writeFileSync('icon16.png', createPng(16, 16, 229, 9, 20));
fs.writeFileSync('icon48.png', createPng(48, 48, 229, 9, 20));
fs.writeFileSync('icon128.png', createPng(128, 128, 229, 9, 20));

console.log('Icons generated successfully.');
