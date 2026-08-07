const crypto = require("crypto");

function encryptionKey() {
    const secret = process.env.AUTHKEY_ENCRYPTION_SECRET;
    if (!secret || secret.length < 32) throw new Error("AUTHKEY_ENCRYPTION_SECRET must be at least 32 characters.");
    return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decrypt(credentials) {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(credentials.credentialIv, "base64"));
    decipher.setAuthTag(Buffer.from(credentials.credentialTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(credentials.encryptedCredentials, "base64")), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
