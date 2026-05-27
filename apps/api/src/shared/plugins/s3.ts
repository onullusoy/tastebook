import fp from "fastify-plugin";
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";

export default fp(async (fastify) => {
  const s3 = new S3Client({
    endpoint: `http://${fastify.config.MINIO_ENDPOINT}:${fastify.config.MINIO_PORT}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: fastify.config.MINIO_ACCESS_KEY,
      secretAccessKey: fastify.config.MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: fastify.config.MINIO_BUCKET }));
  } catch (headErr: any) {
    if (headErr.$metadata?.httpStatusCode === 404 || headErr.name === "NotFound" || headErr.name === "NoSuchBucket") {
      await s3.send(new CreateBucketCommand({ Bucket: fastify.config.MINIO_BUCKET }));
      const policy = {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${fastify.config.MINIO_BUCKET}/*`],
        }],
      };
      await s3.send(new PutBucketPolicyCommand({
        Bucket: fastify.config.MINIO_BUCKET,
        Policy: JSON.stringify(policy),
      }));
    } else {
      throw headErr;
    }
  }

  fastify.decorate("s3", s3);
  fastify.addHook("onClose", async () => {
    s3.destroy();
  });
});
