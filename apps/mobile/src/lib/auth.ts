import JSEncrypt from 'jsencrypt';
import CryptoJS from 'crypto-js';

// RuoYi-Vue-Plus 统一客户端安全参数 (与服务端 api-decrypt 一致)
export const CLIENT_ID = 'e5cd7e4891bf95d1d19206ce24a7b32e';

export const RSA_PUBLIC_KEY =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDvEDuRIOM3oZPWj9Ukoc5pQklR4PFH6/clnjeFqjDLIgDyQvjxhgqAZQA+E9eD6qu6FsXPmK8djcL+nh3cFHz4pX473jDvO3Sve+8yL3VRQ0n2pRgQ2a01MJsy+WwTZCBYWf0VnLRIvANUoWQgy9vz94q7Va44dg7A1/3ICf+xAwIDAQAB';

export const RSA_PRIVATE_KEY =
  'MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAObq7yrxfvyieZtTjAYyrdvi59tYTXxjO5ajmPCRSXBY9M9wQ1tli297JN6mnY53UJMNyOFNSZVi8WSFoIXjpR87FmvChJlzeN/dZdd3SEs48Ee66XKeSePYqxa8oO5GKDsnajgpsOHKXSeeVSIysiIPS2/WsEqk0In9P4w3RsRFAgMBAAECgYBiMEWwce24SPICnRzuScBpvmsudrbEDIH7BOd0a6LZlcnLJwZNJ7mJlshPsHNQb+WgEf135+BBGEhioPtn0yuTdEuKP4kB9UdYUKiayWCoWhJpesv7sAD4RDClV7dhuV+gcd1AXD+YzyRIPbGm0VC2U+4q8/+UPRpVjqskbLVTgQJBAPRpou7g3S8n4XB527kq0D8I3+ZYwMxZhszwhrCDpJU319+ucmpLVwYIzDmZVeID2QQdUaDfIEViFHu95xDrGiUCQQDx3YOKn3yaEctk/ERVn7hDAyAXUbd8/pv2b24/M/l1ZevlsFem8U4Jk5Mu64t3z3YGJoymEjQmbucwT01iKhehAkEAxlnccsRmfFh/KkqauKE4M4++NTAd9zlInpUsmZ+cN8UEGnF2RTEzRKBrLOt1uWCqBB7PGiE6DVTVjr7FAQPrSQJAT5yeY87DcONSk9cFlzmPqV8p/QME5rvYEnHzVBKDlkUKNPyqnWToTvaoh9U4fyNmsfeWbEOprszqhFhWHG3GgQJAK8+ynmyFhaw63+Hx2KU5zR4hVuQso2IzrEurGxCxybV6mR7VBerb4502+EPx3PmOgxQL+niUFhcMWxcvBFP9+A==';

function generateRandomKey(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export function encryptPayload(data: any): { encryptedKey: string; encryptedData: string } {
  const rawKey = generateRandomKey(32);
  const keyBase64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(rawKey));

  // 1. RSA 加密 Base64 后的 AES Key
  const rsa = new JSEncrypt();
  rsa.setPublicKey(RSA_PUBLIC_KEY);
  const encryptedKey = rsa.encrypt(keyBase64);
  if (!encryptedKey) {
    throw new Error('RSA 加密密钥失败');
  }

  // 2. AES-256-ECB 加密请求体 JSON
  const aesKey = CryptoJS.enc.Utf8.parse(rawKey);
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(jsonStr, aesKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encryptedKey,
    encryptedData: encrypted.toString(),
  };
}

export function decryptResponse(encryptedText: string, encryptKeyHeader?: string | null): any {
  if (!encryptKeyHeader) {
    try {
      return JSON.parse(encryptedText);
    } catch {
      return encryptedText;
    }
  }

  // RSA 私钥解密 AES key
  const rsa = new JSEncrypt();
  rsa.setPrivateKey(RSA_PRIVATE_KEY);
  const keyBase64 = rsa.decrypt(encryptKeyHeader);
  if (!keyBase64) {
    throw new Error('解密响应密钥失败');
  }
  const rawKey = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(keyBase64));

  const aesKey = CryptoJS.enc.Utf8.parse(rawKey);
  const decrypted = CryptoJS.AES.decrypt(encryptedText, aesKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
  return JSON.parse(decryptedText);
}

export interface CaptchaData {
  captchaEnabled: boolean;
  uuid: string;
  img: string;
}

export async function fetchCaptcha(serverUrl: string): Promise<CaptchaData> {
  const url = `${serverUrl.replace(/\/$/, '')}/api/auth/code`;
  const res = await fetch(url, {
    headers: {
      clientid: CLIENT_ID,
    },
  });
  const json = await res.json();
  if (json.code === 200 && json.data) {
    return json.data;
  }
  throw new Error(json.msg || '获取验证码失败');
}

export interface LoginParams {
  username: string;
  password: string;
  code?: string;
  uuid?: string;
  tenantId?: string;
}

export interface LoginResult {
  access_token: string;
  expire_in: number;
}

export async function loginWithRuoYi(serverUrl: string, params: LoginParams): Promise<LoginResult> {
  const url = `${serverUrl.replace(/\/$/, '')}/api/auth/login`;

  const payload = {
    tenantId: params.tenantId || '000000',
    username: params.username.trim(),
    password: params.password,
    code: params.code?.trim() || '',
    uuid: params.uuid || '',
    grantType: 'password',
    clientId: CLIENT_ID,
  };

  const { encryptedKey, encryptedData } = encryptPayload(payload);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      clientid: CLIENT_ID,
      'encrypt-key': encryptedKey,
    },
    body: encryptedData,
  });

  const encryptHeader = res.headers.get('encrypt-key');
  const rawText = await res.text();
  const data = decryptResponse(rawText, encryptHeader);

  if (data.code === 200 && data.data?.access_token) {
    return data.data;
  }
  throw new Error(data.msg || data.error?.message || '登录失败，请检查账号密码');
}
