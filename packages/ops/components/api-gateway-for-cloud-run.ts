import * as fs from "node:fs";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

interface ApiGatewayForCloudRunArgs {
  project: string;
  region: string;
  serviceName: string;
  cloudRunService: gcp.cloudrunv2.Service;
  dependsOn?: pulumi.Input<pulumi.Resource[]>;
}

export class ApiGatewayForCloudRun extends pulumi.ComponentResource {
  public readonly gateway: gcp.apigateway.Gateway;
  public readonly api: gcp.apigateway.Api;

  constructor(
    name: string,
    args: ApiGatewayForCloudRunArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(`mcp:ops:ApiGatewayForCloudRun`, name, args, opts);

    // --- API GatewayのAPIリソースを作成 ---
    // APIキーでアクセス制限をかける際の全体を管理する単位となります。
    this.api = new gcp.apigateway.Api(
      `${args.serviceName}-api`,
      {
        apiId: args.serviceName,
        project: args.project,
      },
      { parent: this, dependsOn: args.dependsOn },
    );

    // --- openapi仕様書を読み込み、Cloud RunのURLを動的に埋め込む ---
    // テンプレートファイル内のプレースホルダーを、実際にデプロイされたCloud RunサービスのURLに置き換えています。
    const openapiContent = args.cloudRunService.uri.apply((uri) => {
      const content = fs.readFileSync("openapi.yaml", "utf-8");
      return content.replace(/\$\{cloud_run_url\}/g, uri);
    });

    // --- APIの「設定（コンフィグ）」リソースを作成 ---
    // 1つのAPIに対して複数のコンフィグを持つことができ、これによりAPIのバージョン管理が可能になります。
    const apiConfig = new gcp.apigateway.ApiConfig(
      `${args.serviceName}-api-config`,
      {
        api: this.api.apiId,
        apiConfigId: `${args.serviceName}-config`,
        openapiDocuments: [
          {
            document: {
              path: "openapi.yaml",
              contents: openapiContent.apply((content) =>
                Buffer.from(content).toString("base64"),
              ),
            },
          },
        ],
      },
      {
        parent: this,
        dependsOn: [args.cloudRunService],
      },
    );

    // ---「ゲートウェイ」リソースを作成 ---
    // これが、APIを外部に公開するための実際のエンドポイント（URL）を持つリソースです。
    // 作成したAPIコンフィグをこのゲートウェイにデプロイすることで、APIが利用可能になります。
    this.gateway = new gcp.apigateway.Gateway(
      `${args.serviceName}-gateway`,
      {
        apiConfig: apiConfig.id,
        gatewayId: args.serviceName,
        project: args.project,
        region: args.region,
      },
      { parent: this, dependsOn: [apiConfig] },
    );

    // --- API GatewayからCloud Runを呼び出すための権限設定 ---
    // API Gatewayは、Googleが管理するサービスアカウントを使ってバックエンドを呼び出します。
    // サービスアカウントに、Cloud Runサービスを呼び出す権限（roles/run.invoker）を付与する必要があります。

    // プロジェクト情報を取得して、プロジェクト番号を特定します。
    const project = gcp.organizations.getProject({
      projectId: args.project,
    });

    // プロジェクト番号からAPI Gatewayのサービスアカウントのメールアドレスを取得します
    const apigatewaySaEmail = project.then(
      (p) => `service-${p.number}@gcp-sa-apigateway.iam.gserviceaccount.com`,
    );

    // API GatewayのサービスアカウントにCloud Run起動ロールを付与します。
    new gcp.cloudrunv2.ServiceIamMember("api-gateway-invoker", {
      project: args.cloudRunService.project,
      location: args.cloudRunService.location,
      name: args.cloudRunService.name,
      role: "roles/run.invoker",
      member: pulumi.interpolate`serviceAccount:${apigatewaySaEmail}`,
    });

    this.registerOutputs({
      gateway: this.gateway,
      api: this.api,
    });
  }
}
