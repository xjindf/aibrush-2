import * as AWS from 'aws-sdk';
import fs from 'fs';

export interface Filestore {
    exists(filename: string): Promise<boolean>;
    readFile(filename: string): Promise<string>;
    writeFile(filename: string, data: string |  Buffer): Promise<void>;
    readBinaryFile(filename: string): Promise<Buffer>;
    deleteFile(filename: string): Promise<void>;
}

export class S3Filestore implements Filestore {
    private readonly s3: AWS.S3;
    private readonly bucket: string;

    constructor(bucket: string, region: string) {
        this.s3 = new AWS.S3({
            region: region,
        });
        this.bucket = bucket;
    }

    async exists(filename: string): Promise<boolean> {
        try {
            await this.s3.headObject({
                Bucket: this.bucket,
                Key: filename
            }).promise();
            return true;
        } catch (e) {
            return false;
        }
    }

    async readFile(filename: string): Promise<string> {
        const data = await this.s3.getObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
        return data.Body.toString('utf-8');
    }

    async writeFile(filename: string, data: string | Buffer): Promise<void> {
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: filename,
            Body: data,
            // public read access
            ACL: 'public-read',
        }).promise();
    }

    async readBinaryFile(filename: string): Promise<Buffer> {
        const data = await this.s3.getObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
        return data.Body as Buffer;
    }

    async deleteFile(filename: string): Promise<void> {
        await this.s3.deleteObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
    }
}

export class LocalFilestore implements Filestore {

    constructor(private dataFolderName: string) {
        if (!fs.existsSync(dataFolderName)) {
            fs.mkdirSync(dataFolderName);
        }
    }

    async exists(filename: string): Promise<boolean> {
        return fs.existsSync(`${this.dataFolderName}/${filename}`);
    }

    async readFile(filename: string): Promise<string> {
        return fs.readFileSync(`${this.dataFolderName}/${filename}`, 'utf-8');
    }

    async writeFile(filename: string, data: string | Buffer): Promise<void> {
        fs.writeFileSync(`${this.dataFolderName}/${filename}`, data);
    }

    async readBinaryFile(filename: string): Promise<Buffer> {
        return fs.readFileSync(`${this.dataFolderName}/${filename}`);
    }

    async deleteFile(filename: string): Promise<void> {
        fs.unlinkSync(`${this.dataFolderName}/${filename}`);
    }
}