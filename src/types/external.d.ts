declare module "acme-client" {
    const acme: {
        directory: { letsencrypt: { production: string; staging: string } };
    };
    export default acme;
}

declare module "node-forge" {
    const forge: {
        pki: {
            certificateFromPem(data: string): { validity: { notAfter: Date } };
            rsa: { generateKeyPair(bits: number): { publicKey: unknown; privateKey: unknown } };
            createCertificate(): {
                publicKey: unknown;
                serialNumber: string;
                validity: { notBefore: Date; notAfter: Date };
                setSubject(attrs: Array<{ name: string; value: string }>): void;
                setIssuer(attrs: Array<{ name: string; value: string }>): void;
                sign(privateKey: unknown): void;
            };
            certificateToPem(cert: unknown): string;
            privateKeyToPem(key: unknown): string;
        };
    };
    export default forge;
}
