import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

interface ApiKeyArgs {
  project: string;
  serviceName: string;
  api: gcp.apigateway.Api;
  dependsOn?: pulumi.Input<pulumi.Resource[]>;
}

export class ApiKey extends pulumi.ComponentResource {
  public readonly keyString: pulumi.Output<string>;

  constructor(
    name: string,
    args: ApiKeyArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("mcp:ops:ApiKey", name, args, opts);

    // --- APIキー名のための一意な接尾辞を生成 ---
    // GCPのAPIキーは削除後30日間、同じ名前で再作成できません（ソフトデリート）。
    // この問題を回避するため、キーの名前にランダムな文字列を追加し`pulumi destroy`直後の再作成でも名前が衝突しないようにします。
    const randomSuffix = new random.RandomString(
      `${args.serviceName}-key-suffix`,
      {
        length: 6,
        special: false,
        upper: false,
      },
      { parent: this },
    );

    // --- APIキーリソースを作成 ---
    const key = new gcp.projects.ApiKey(
      `${args.serviceName}-api-key`,
      {
        project: args.project,
        name: pulumi.interpolate`${args.serviceName}-key-${randomSuffix.result}`,
        displayName: `API Key for ${args.serviceName}`,
        // セキュリティのベストプラクティスとして、APIキーがアクセスできるAPIを特定のものに限定します。
        restrictions: {
          apiTargets: [{ service: args.api.managedService }],
        },
      },
      {
        parent: this,
        dependsOn: args.dependsOn,
      },
    );

    this.keyString = key.keyString;

    this.registerOutputs({
      keyString: this.keyString,
    });
  }
}
