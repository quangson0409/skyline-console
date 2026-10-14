/* IP / CIDR validation (legacy utils/validate), shared by the network forms */
const ipv4Re = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const isIPv4 = (v) => ipv4Re.test(String(v || '').trim());
export const isIPv6 = (v) => {
  const s = String(v || '').trim();
  if (!s.includes(':')) return false;
  try {
    // URL parser validates IPv6 literals
    // eslint-disable-next-line no-new
    new URL(`http://[${s}]/`);
    return true;
  } catch {
    return false;
  }
};
export const isIP = (v) => isIPv4(v) || isIPv6(v);
export const isCidr = (v, version) => {
  const [ip, mask, extra] = String(v || '').trim().split('/');
  if (extra !== undefined || mask === undefined || !/^\d+$/.test(mask)) return false;
  const m = Number(mask);
  if ((version === 4 || version === undefined) && isIPv4(ip) && m <= 32) return true;
  if ((version === 6 || version === undefined) && isIPv6(ip) && m <= 128) return true;
  return false;
};
