import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

interface BackendServiceArgs {
  project: string;
  region: string;
  serviceName: string;
  imageName: pulumi.Input<string>;
  dependsOn?: pulumi.Input<pulumi.Resource[]>;
}

export class BackendService extends pulumi.ComponentResource {
  public readonly service: gcp.cloudrunv2.Service;
  public readonly uri: pulumi.Output<string>;

  constructor(
    name: string,
    args: BackendServiceArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("mcp:ops:BackendService", name, args, opts);

    // --- Cloud Runサービスを作成 ---
    this.service = new gcp.cloudrunv2.Service(
      `${args.serviceName}-service`,
      {
        location: args.region,
        project: args.project,
        name: args.serviceName,
        // "INGRESS_TRAFFIC_ALL"は、すべてのソースからのリクエストを許可します。
        ingress: "INGRESS_TRAFFIC_ALL",
        deletionProtection: false,
        template: {
          containers: [
            {
              // `ContainerImage`コンポーネントから渡された、ダイジェスト付きの一意なイメージ名を指定します。
              image: args.imageName,
              resources: {
                limits: { cpu: "1", memory: "1Gi" },
              },
              ports: { containerPort: 8080 },
            },
          ],
        },
      },
      { parent: this, dependsOn: args.dependsOn },
    );

    this.uri = this.service.uri;

    this.registerOutputs({
      service: this.service,
      uri: this.uri,
    });
  }
}
