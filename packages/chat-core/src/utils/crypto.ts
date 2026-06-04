const getWebCrypto = () => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random values are unavailable in this environment.');
  }
  return globalThis.crypto;
};

export const generateSecureRandomString = (length = 6): string => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer.');
  }

  const randomBytes = new Uint8Array(Math.ceil(length / 2));
  getWebCrypto().getRandomValues(randomBytes);

  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
};

export const generateSecureRandomHex = (byteLength = 4): string => {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error('Byte length must be a positive integer.');
  }

  return generateSecureRandomString(byteLength * 2);
};

export const generateSecureRandomInt = (max: number): number => {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new Error('Max must be an integer between 1 and 2^32.');
  }

  const randomValues = new Uint32Array(1);
  const maxRange = 0x100000000;
  const limit = maxRange - (maxRange % max);
  const webCrypto = getWebCrypto();

  let randomValue = maxRange;
  while (randomValue >= limit) {
    webCrypto.getRandomValues(randomValues);
    randomValue = randomValues[0] ?? maxRange;
  }

  return randomValue % max;
};
