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
    const clerkPublishableKey = new sst.Secret("ClerkPublishableKey");
    const openaiApiKey = new sst.Secret("OpenaiApiKey");

    // ---- Networking ----
    const vpc = new sst.aws.Vpc("Vpc", {
      nat: "ec2", // fck-nat instance (~$3/mo vs $30+/mo managed NAT gateway)
    });

    // ---- Database ----
    const database = new sst.aws.Postgres("Database", {
      vpc,
      version: "18.3",
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
        CORS_ORIGIN: "https://knownissue.dev,https://www.knownissue.dev",
        API_BASE_URL: "https://mcp.knownissue.dev", // public URL for OAuth metadata endpoints
        DATABASE_URL: $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`,
        CLERK_SECRET_KEY: clerkSecretKey.value,
        CLERK_PUBLISHABLE_KEY: clerkPublishableKey.value,
        OPENAI_API_KEY: openaiApiKey.value,
      },
      loadBalancer: {
        rules: [
          { listen: "80/http", forward: "3001/http" },
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

    // ---- Observability ----
    const logGroupName = $interpolate`/sst/knownissue/${$app.stage}/Api`;

    const alertTopic = new aws.sns.Topic("AlertTopic", {
      name: $interpolate`knownissue-${$app.stage}-alerts`,
    });

    new aws.sns.TopicSubscription("AlertEmail", {
      topic: alertTopic.arn,
      protocol: "email",
      endpoint: "gonglx8@gmail.com",
    });

    // Metric filter: 5xx error count
    new aws.cloudwatch.LogMetricFilter("ErrorCountFilter", {
      logGroupName,
      name: $interpolate`knownissue-${$app.stage}-error-count`,
      pattern: '{ $.status >= 500 }',
      metricTransformation: {
        name: "ErrorCount",
        namespace: $interpolate`knownissue/${$app.stage}`,
        value: "1",
        defaultValue: "0",
      },
    });

    new aws.cloudwatch.MetricAlarm("ErrorRateAlarm", {
      alarmName: $interpolate`knownissue-${$app.stage}-error-rate`,
      alarmDescription: "More than 10 5xx errors in 5 minutes",
      namespace: $interpolate`knownissue/${$app.stage}`,
      metricName: "ErrorCount",
      statistic: "Sum",
      period: 300,
      evaluationPeriods: 1,
      threshold: 10,
      comparisonOperator: "GreaterThanThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertTopic.arn],
      okActions: [alertTopic.arn],
    });

    // Metric filter: request latency (p95)
    new aws.cloudwatch.LogMetricFilter("LatencyFilter", {
      logGroupName,
      name: $interpolate`knownissue-${$app.stage}-latency`,
      pattern: '{ $.duration = * }',
      metricTransformation: {
        name: "RequestLatency",
        namespace: $interpolate`knownissue/${$app.stage}`,
        value: "$.duration",
        defaultValue: "0",
      },
    });

    new aws.cloudwatch.MetricAlarm("HighLatencyAlarm", {
      alarmName: $interpolate`knownissue-${$app.stage}-high-latency`,
      alarmDescription: "p95 latency exceeds 2000ms over 5 minutes",
      namespace: $interpolate`knownissue/${$app.stage}`,
      metricName: "RequestLatency",
      extendedStatistic: "p95",
      period: 300,
      evaluationPeriods: 1,
      threshold: 2000,
      comparisonOperator: "GreaterThanThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertTopic.arn],
      okActions: [alertTopic.arn],
    });

    // Metric filter: MCP endpoint errors
    new aws.cloudwatch.LogMetricFilter("McpErrorFilter", {
      logGroupName,
      name: $interpolate`knownissue-${$app.stage}-mcp-errors`,
      pattern: '{ $.status >= 500 && $.path = "/mcp" }',
      metricTransformation: {
        name: "McpErrorCount",
        namespace: $interpolate`knownissue/${$app.stage}`,
        value: "1",
        defaultValue: "0",
      },
    });

    new aws.cloudwatch.MetricAlarm("McpErrorAlarm", {
      alarmName: $interpolate`knownissue-${$app.stage}-mcp-errors`,
      alarmDescription: "More than 5 MCP errors in 5 minutes",
      namespace: $interpolate`knownissue/${$app.stage}`,
      metricName: "McpErrorCount",
      statistic: "Sum",
      period: 300,
      evaluationPeriods: 1,
      threshold: 5,
      comparisonOperator: "GreaterThanThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertTopic.arn],
      okActions: [alertTopic.arn],
    });

    // Metric filter: health check failures
    new aws.cloudwatch.LogMetricFilter("HealthCheckFailFilter", {
      logGroupName,
      name: $interpolate`knownissue-${$app.stage}-healthcheck-fails`,
      pattern: '{ $.path = "/health" && $.status != 200 }',
      metricTransformation: {
        name: "HealthCheckFailCount",
        namespace: $interpolate`knownissue/${$app.stage}`,
        value: "1",
        defaultValue: "0",
      },
    });

    new aws.cloudwatch.MetricAlarm("HealthCheckAlarm", {
      alarmName: $interpolate`knownissue-${$app.stage}-healthcheck-fails`,
      alarmDescription: "More than 3 health check failures in 5 minutes",
      namespace: $interpolate`knownissue/${$app.stage}`,
      metricName: "HealthCheckFailCount",
      statistic: "Sum",
      period: 300,
      evaluationPeriods: 1,
      threshold: 3,
      comparisonOperator: "GreaterThanThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertTopic.arn],
      okActions: [alertTopic.arn],
    });

    return {
      apiUrl: api.url,
    };
  },
});
