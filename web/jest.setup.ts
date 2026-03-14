import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// jsdom does not provide ReadableStream; polyfill from Node's web streams
if (typeof globalThis.ReadableStream === 'undefined') {
  const { ReadableStream } = require('stream/web');
  globalThis.ReadableStream = ReadableStream;
}

// TextEncoder / TextDecoder are available in Node but may be missing in some jsdom setups
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
