let API_URL: string | undefined = 'https://api-sandbox.nimiqoasis.com/v1';

type OasisError = {
    type: string,
    title: string,
    status: number,
}

export enum Asset {
    EUR = 'EUR',
}

export enum HtlcStatus {
    PENDING = 'pending',
    CLEARED = 'cleared',
    SETTLED = 'settled',
    EXPIRED = 'expired',
}

export enum TransactionType {
    SEPA = 'sepa',
    MOCK = 'mock', // Only available in Sandbox environment
}

type SepaRecipient = {
    iban: string,
    name: string,
    bic?: string,
    address?: {
        line1: string,
        line2?: string,
        city: string,
        state: string,
        postalCode: string,
        country: string,
    },
}

type SepaClearingInstruction = {
    type: TransactionType.SEPA,
    fee: number,
    amount: number,
    recipient: SepaRecipient,
    purpose?: string,
}

type MockClearingInstruction = {
    type: TransactionType.MOCK,
    description: string,
}

type ClearingInstruction = SepaClearingInstruction | MockClearingInstruction;

type SettlementInfo = {
    type: TransactionType,
    fee: number,
}

export type SepaSettlementInstruction = {
    type: TransactionType.SEPA,
    contractId: string,
    recipient: SepaRecipient,
}

export type MockSettlementInstruction = {
    type: TransactionType.MOCK,
    contractId: string,
}

export type SettlementInstruction = SepaSettlementInstruction | MockSettlementInstruction;

type OasisHtlc<TStatus extends HtlcStatus> = {
    id: string,
    status: TStatus,
    asset: Asset,
    amount: number,
    beneficiary: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: string,
    } | {
        kty: 'EC',
        crv: 'P-256',
        x: string,
        y: string,
    },
    hash: {
        algorithm: 'sha256' | 'blake2b', // 'sha512' excluded for now, as it requires a different preimage size
        value: string,
    },
    preimage: {
        size: 32,
    } & (TStatus extends HtlcStatus.SETTLED ? { value: string } : {}),
    expires: string,
} & (TStatus extends HtlcStatus.PENDING ? { clearing: ClearingInstruction[] } : {})
  & (TStatus extends HtlcStatus.CLEARED ? { settlement: SettlementInfo[] } : {})

export type Htlc<TStatus extends HtlcStatus> = {
    id: string,
    status: TStatus,
    asset: Asset,
    amount: number,
    beneficiary: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: string,
    } | {
        kty: 'EC',
        crv: 'P-256',
        x: string,
        y: string,
    },
    hash: {
        algorithm: 'sha256' | 'blake2b', // 'sha512' excluded for now, as it requires a different preimage size
        value: string,
    },
    preimage: {
        size: 32,
    } & (TStatus extends HtlcStatus.SETTLED ? { value: string } : {}),
    expires: number,
} & (TStatus extends HtlcStatus.PENDING ? { clearing: ClearingInstruction[] } : {})
  & (TStatus extends HtlcStatus.CLEARED ? { settlement: SettlementInfo[] } : {})

export function init(url: string) {
    if (!url) throw new Error('url must be provided');
    API_URL = url;
}

async function api(path: string, method: 'POST' | 'GET' | 'DELETE', body?: object): Promise<OasisHtlc<HtlcStatus>> {
    if (!API_URL) throw new Error('API URL not set, call init() first');

    return fetch(`${API_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(async (res) => {
        if (!res.ok) {
            const error = await res.json() as OasisError;
            throw new Error(error.title);
        }
        return res.json();
    });
}

export async function createHtlc(
    contract: Pick<OasisHtlc<HtlcStatus>, 'asset' | 'amount' | 'beneficiary' | 'hash' | 'preimage' | 'expires'>,
): Promise<Htlc<HtlcStatus.PENDING>> {
    if (contract.beneficiary.kty === 'OKP') {
        let x = contract.beneficiary.x;
        if (x.length === 64) {
            x = hexToBase64(x);
        } else if (fromBase64Url(x).length !== 32) {
            throw new Error('Beneficiary x must be in HEX or Base64Url format');
        }
    }

    if (contract.beneficiary.kty === 'EC') {
        if (contract.beneficiary.x.length === 64) {
            contract.beneficiary.x = hexToBase64(contract.beneficiary.x);
        } else if (fromBase64Url(contract.beneficiary.x).length !== 32) {
            throw new Error('Beneficiary x must be in HEX or Base64Url format');
        }
        if (contract.beneficiary.y.length === 64) {
            contract.beneficiary.y = hexToBase64(contract.beneficiary.y);
        } else if (fromBase64Url(contract.beneficiary.y).length !== 32) {
            throw new Error('Beneficiary x must be in HEX or Base64Url format');
        }
    }

    if (contract.hash.value.length === 64) {
        contract.hash.value = hexToBase64(contract.hash.value);
    } else if (fromBase64Url(contract.hash.value).length !== 32) {
        throw new Error('Hash value must be in HEX or Base64Url format');
    }

    if (typeof contract.expires === 'number') {
        const expires = contract.expires * (contract.expires < 1e12 ? 1000 : 1);
        contract.expires = new Date(expires).toISOString();
    }

    const htlc = await api('/htlc', 'POST', contract) as OasisHtlc<HtlcStatus.PENDING>;
    return convertHtlc(htlc);
}

export async function getHtlc(id: string): Promise<Htlc<HtlcStatus>> {
    const htlc = await api(`/htlc/${id}`, 'GET');
    return convertHtlc(htlc);
}

export async function settleHtlc(
    id: string,
    secret: string,
    settlementJWS: string,
): Promise<Htlc<HtlcStatus.SETTLED>> {
    if (secret.length === 64) {
        secret = hexToBase64(secret);
    } else if (fromBase64Url(secret).length !== 32) {
        throw new Error('Secret must be in HEX or Base64Url format');
    }

    if ((settlementJWS.split('.') || []).length !== 3) {
        throw new Error('Invalid settlement instruction JWS');
    }

    const htlc = await api(`/htlc/${id}/settle`, 'POST', {
        preimage: secret,
        settlement: settlementJWS,
    }) as OasisHtlc<HtlcStatus.SETTLED>;
    return convertHtlc(htlc);
}

export async function sandboxMockClearHtlc(id: string): Promise<boolean> {
    if (!API_URL) throw new Error('API URL not set, call init() first');

    return fetch(`${API_URL}/mock/clear/${id}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    }).then(async (res) => {
        if (!res.ok) {
            throw new Error('Mock-clearing failed');
        }
        return true;
    });
}

function convertHtlc<TStatus extends HtlcStatus>(htlc: OasisHtlc<TStatus>): Htlc<TStatus> {
    // @ts-ignore
    const contract: Htlc<TStatus> = {
        id: htlc.id,
        status: htlc.status,
        asset: htlc.asset,
        amount: coinsToUnits(htlc.asset, htlc.amount),
        beneficiary: {
            ...htlc.beneficiary,
            ...(htlc.beneficiary.kty === 'OKP' ? {
                x: base64ToHex(htlc.beneficiary.x),
            } : {}),
            ...(htlc.beneficiary.kty === 'EC' ? {
                x: base64ToHex(htlc.beneficiary.x),
                y: base64ToHex(htlc.beneficiary.y),
            } : {}),
        },
        hash: {
            ...htlc.hash,
            value: base64ToHex(htlc.hash.value),
        },
        preimage: {
            ...htlc.preimage,
            ...('value' in htlc.preimage ? {
                value: base64ToHex((htlc as unknown as OasisHtlc<HtlcStatus.SETTLED>).preimage.value),
            } : {}),
        },
        expires: Math.floor(Date.parse(htlc.expires) / 1000),
        ...('clearing' in (htlc as unknown as OasisHtlc<HtlcStatus.PENDING>) ? {
            clearing: (htlc as unknown as OasisHtlc<HtlcStatus.PENDING>).clearing.map(instructions => ({
                ...instructions,
                ...('fee' in instructions ? {
                    fee: coinsToUnits(htlc.asset, instructions.fee),
                } : {}),
                ...('amount' in instructions ? {
                    amount: coinsToUnits(htlc.asset, instructions.amount),
                } : {}),
            })),
        } : {}),
        ...('settlement' in (htlc as unknown as OasisHtlc<HtlcStatus.CLEARED>) ? {
            settlement: (htlc as unknown as OasisHtlc<HtlcStatus.CLEARED>).settlement.map(instructions => ({
                ...instructions,
                fee: coinsToUnits(htlc.asset, instructions.fee),
            })),
        } : {}),
    };

    return contract;
}

function coinsToUnits(asset: Asset, value: string | number): number {
    let decimals: number;
    switch (asset) {
        case Asset.EUR: decimals = 2; break;
        default: throw new Error('Invalid asset');
    }
    const parts = value.toString().split('.');
    parts[1] = (parts[1] || '').substr(0, decimals).padEnd(decimals, '0');
    return parseInt(parts.join(''), 10);
}

function base64ToHex(base64: string): string {
    return toHex(fromBase64Url(base64));
}

function hexToBase64(hex: string): string {
    return toBase64Url(fromHex(hex));
}

function fromBase64Url(base64: string): Uint8Array {
    base64 = base64.replace(/_/g, '/').replace(/-/g, '+').replace(/\./g, '=');
    return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
}

function toBase64Url(buffer: Uint8Array): string {
    let byteString = '';
    for (let i = 0; i < buffer.length; i++) {
        const code = buffer[i];
        byteString += String.fromCharCode(code);
    }
    return btoa(byteString).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '.');
}

function fromHex(hex: string): Uint8Array {
    return new Uint8Array((hex.trim().match(/.{2}/g) || []).map(byte => parseInt(byte, 16)));
}

function toHex(buffer: Uint8Array): string {
    const HEX_ALPHABET = '0123456789abcdef';
    let hex = '';
    for (let i = 0; i < buffer.length; i++) {
        const code = buffer[i];
        hex += HEX_ALPHABET[code >>> 4];
        hex += HEX_ALPHABET[code & 0x0F];
    }
    return hex;
}
