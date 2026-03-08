/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "knownissue",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      home: "aws",
      providers: {
        aws: { region: "us-east-1" },
      },
    };
  },
  async run() {
    // ---- Secrets (set via: npx sst secret set <Name> <value>) ----
    const clerkSecretKey = new sst.Secret("ClerkSecretKey");
    const openaiApiKey = new sst.Secret("OpenaiApiKey");

    // ---- Networking ----
    const vpc = new sst.aws.Vpc("Vpc", {
      nat: "ec2", // fck-nat instance (~$3/mo vs $30+/mo managed NAT gateway)
    });

    // ---- Database ----
    const database = new sst.aws.Postgres("Database", {
      vpc,
      version: "16.4",
      instance: "t4g.micro",
      storage: "20 GB",
    });

    // ---- ECS Cluster + API Service ----
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    const api = new sst.aws.Service("Api", {
      cluster,
      image: {
        context: ".",
        dockerfile: "Dockerfile",
      },
      cpu: "0.5 vCPU",
      memory: "1 GB",
      scaling: {
        min: 2,
        max: 10,
        cpuUtilization: 70,
        memoryUtilization: 80,
      },
      environment: {
        NODE_ENV: "production",
        API_PORT: "3001",
        CORS_ORIGIN: "https://knownissue.dev",
        DATABASE_URL: $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`,
        CLERK_SECRET_KEY: clerkSecretKey.value,
        OPENAI_API_KEY: openaiApiKey.value,
      },
      loadBalancer: {
        domain: "mcp.knownissue.dev",
        rules: [
          { listen: "80/http", redirect: "443/https" },
          { listen: "443/https", forward: "3001/http" },
        ],
        health: {
          "3001/http": {
            path: "/health",
            interval: "15 seconds",
            healthyThreshold: 2,
            unhealthyThreshold: 3,
          },
        },
      },
    });

    return {
      apiUrl: api.url,
    };
  },
});
