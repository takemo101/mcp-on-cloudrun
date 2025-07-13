import * as command from "@pulumi/command";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { z } from "zod";
import {
  ApiGatewayForCloudRun,
  ApiKey,
  BackendService,
  ContainerImage,
  ProjectServices,
} from "./components";

// --- 基本設定の読み込み ---
// PulumiのGCP設定からプロジェクトIDとリージョンを取得します。
// zodを使って環境変数のバリデーションとデフォルト値設定を行っています。
const { project, region } = z
  .object({
    project: z.string().nonempty(),
    region: z.string().default("asia-northeast1"),
  })
  .parse(gcp.config);

// サービス名を定義します。これは各リソースの命名規則のプレフィックスとして利用されます。
const serviceName = "mcp-on-cloudrun";

console.log(`Project: ${project}`);
console.log(`Region: ${region}`);

// --- GCP APIの有効化 ---
// このインフラで利用するGCPサービスを有効化します。
// GCPでは、各サービスを利用する前にAPIを有効にする必要があります。
const projectServices = new ProjectServices("project-services", {
  project,
  services: [
    "iam.googleapis.com", // IAM
    "cloudresourcemanager.googleapis.com", // プロジェクトリソース
    "artifactregistry.googleapis.com", // コンテナイメージ
    "run.googleapis.com", // Cloud Run
    "apigateway.googleapis.com", // API Gateway
    "servicecontrol.googleapis.com", // サービス管理
    "servicemanagement.googleapis.com", // サービス管理
    "compute.googleapis.com", // API Gatewayが内部で利用
    "apikeys.googleapis.com", // APIキー
  ] as const,
});

// --- コンテナイメージのビルドとプッシュ ---
// DockerイメージをビルドしてGCPのArtifact Registryにプッシュします。
// `dockerContext`でDockerビルドのコンテキストパスを指定します。
// `dependsOn`でAPIが有効化された後に実行されるように制御します。
const containerImage = new ContainerImage("container-image", {
  region,
  project,
  serviceName,
  dockerContext: "../../mcp-server",
  dependsOn: [projectServices],
});

// --- バックエンドサービス (Cloud Run) のデプロイ ---
// Cloud Runサービスをデプロイします。
// `imageName`には、前のステップでビルド・プッシュしたコンテナイメージ名を渡します。
// `dependsOn`でコンテナイメージの準備が完了してからデプロイが始まるようにします。
const backendService = new BackendService("backend-service", {
  region,
  project,
  serviceName,
  imageName: containerImage.imageName,
  dependsOn: [projectServices, containerImage],
});

// --- API Gatewayの構築 ---
// Cloud Runサービスを外部に公開するためのAPI Gatewayを構築します。
// `cloudRunService`に作成したCloud Runサービスを渡して、バックエンドとして設定します。
const apiGateway = new ApiGatewayForCloudRun("api-gateway-for-cloud-run", {
  project,
  region,
  serviceName,
  cloudRunService: backendService.service,
  dependsOn: [projectServices],
});

// --- APIキーの作成 ---
// API Gatewayへのアクセスを制御するためのAPIキーを作成します。
// `api`に作成したAPI Gatewayの情報を渡して、キーをAPIに紐付けます。
const apiKey = new ApiKey(
  "api-key",
  {
    project,
    serviceName,
    api: apiGateway.api,
  },
  { dependsOn: [apiGateway] },
);

// --- API Gateway マネージドサービスの有効化 ---
// すべてのリソースが作成された後に`gcloud`コマンドを直接実行し、API Gatewayのマネージドサービスを有効化します。
// `dependsOn`で主要なリソースがすべて完了した後にこのコマンドが実行されるように保証します。
new command.local.Command(
  "run-after-all-resources-are-ready",
  {
    create: pulumi.interpolate`gcloud services enable ${apiGateway.api.managedService} --project=${project}`,
    delete: pulumi.interpolate`gcloud services disable ${apiGateway.api.managedService} --project=${project}`,
  },
  {
    // このコマンドが他のリソース作成をブロックしないように、主要なリソースに依存させます。
    dependsOn: [apiGateway, apiKey, backendService],
  },
);

export const gatewayUrl = pulumi.interpolate`https://${apiGateway.gateway.defaultHostname}`;
export const apiKeyString = apiKey.keyString;
export const cloudRunUrl = backendService.service.uri;
export const imageName = containerImage.imageName;
