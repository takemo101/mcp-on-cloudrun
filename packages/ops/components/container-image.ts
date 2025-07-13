import * as docker from "@pulumi/docker";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

interface ContainerImageArgs {
  project: string;
  region: string;
  serviceName: string;
  dockerContext: string;
  dependsOn?: pulumi.Input<pulumi.Resource[]>;
}

export class ContainerImage extends pulumi.ComponentResource {
  public readonly imageName: pulumi.Output<string>;

  constructor(
    name: string,
    args: ContainerImageArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("mcp:ops:ContainerImage", name, args, opts);

    // --- Artifact Registryのリポジトリを作成 ---
    // イメージを格納するための場所（リポジトリ）を確保します。
    const repository = new gcp.artifactregistry.Repository(
      `${args.serviceName}-repo`,
      {
        repositoryId: `${args.serviceName}-repo`,
        format: "DOCKER",
        location: args.region,
        project: args.project,
      },
      { parent: this, dependsOn: args.dependsOn },
    );

    // --- イメージのベース名を構築 ---
    const imageName = pulumi.interpolate`${args.region}-docker.pkg.dev/${args.project}/${repository.name}/${args.serviceName}`;

    // --- Dockerイメージをビルドし、Artifact Registryにプッシュ ---
    // `dockerContext`で指定されたパス（例: ../../mcp-server）のDockerfileをビルド
    // `imageName`で指定されたリポジトリにイメージをプッシュ
    const image = new docker.Image(
      `${args.serviceName}-image`,
      {
        imageName,
        build: {
          context: args.dockerContext,
          platform: "linux/amd64",
        },
      },
      { parent: this, dependsOn: [repository] },
    );

    // --- ダイジェスト付きの完全なイメージ名を取得 ---
    // `repoDigest`は、イメージがレジストリにプッシュされた後に確定する、
    // これを使うことで、インフラが特定のイメージバージョンを正確に参照するようになります。
    this.imageName = image.repoDigest;

    this.registerOutputs({
      imageName: this.imageName,
    });
  }
}
