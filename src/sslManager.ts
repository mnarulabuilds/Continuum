import acme from "acme-client";
import forge from "node-forge";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { isSafeHostname } from "./http.js";

const CERT_DIR = "./certs";
if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true, mode: 0o750 });

export type CertificateBundle = { cert: string; key: string };

export const sslManager = {
    async getCertificate(domain: string): Promise<CertificateBundle> {
        if (!isSafeHostname(domain)) throw new Error("Invalid certificate hostname");
        const certPath = path.join(CERT_DIR, `${domain}.cert.pem`);
        const keyPath = path.join(CERT_DIR, `${domain}.key.pem`);
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            const certData = fs.readFileSync(certPath, "utf8");
            if (this.isCertValid(certData)) {
                return { cert: certData, key: fs.readFileSync(keyPath, "utf8") };
            }
            logger.info("SSL Certificate expired, renewing...", { domain });
        }
        return this.provisionCertificate(domain);
    },

    async provisionCertificate(domain: string): Promise<CertificateBundle> {
        logger.info("Provisioning SSL Certificate via ACME", { domain });
        try {
            const directoryUrl = config.acme.directory === "production"
                ? acme.directory.letsencrypt.production
                : acme.directory.letsencrypt.staging;
            logger.info("Using ACME directory", { domain, directory: config.acme.directory, url: directoryUrl });
            if (config.isProduction) {
                throw new Error("ACME challenge provisioning is not configured; mount a trusted certificate instead");
            }
            const { cert, privateKey } = this.generateSelfSigned(domain);
            fs.writeFileSync(path.join(CERT_DIR, `${domain}.cert.pem`), cert, { mode: 0o644 });
            fs.writeFileSync(path.join(CERT_DIR, `${domain}.key.pem`), privateKey, { mode: 0o600 });
            logger.info("SSL Certificate provisioned", { domain });
            return { cert, key: privateKey };
        } catch (error) {
            logger.error("SSL Provisioning Failed", { domain, error: error instanceof Error ? error.message : "unknown" });
            throw error;
        }
    },

    isCertValid(certData: string): boolean {
        try {
            const cert = forge.pki.certificateFromPem(certData);
            const renewalThreshold = new Date(Date.now() + config.acme.renewDays * 24 * 60 * 60 * 1_000);
            return renewalThreshold < cert.validity.notAfter;
        } catch {
            return false;
        }
    },

    generateSelfSigned(domain: string): { cert: string; privateKey: string } {
        const keys = forge.pki.rsa.generateKeyPair(2048);
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = "01";
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
        const attrs = [{ name: "commonName", value: domain }];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.sign(keys.privateKey);
        return { cert: forge.pki.certificateToPem(cert), privateKey: forge.pki.privateKeyToPem(keys.privateKey) };
    },
};
