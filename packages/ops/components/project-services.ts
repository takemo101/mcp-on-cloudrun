import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

export type ProjectServicesArgs<T> = {
  project: string;
  services: T;
};

export class ProjectServices<
  T extends readonly `${string}.googleapis.com`[],
> extends pulumi.ComponentResource {
  public readonly services: Record<string, gcp.projects.Service>;

  constructor(
    name: string,
    args: ProjectServicesArgs<T>,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("custom:resource:ProjectServices", name, {}, opts);

    // --- GCPサービスを有効化するループ処理 ---
    // GCPでは、多くのサービス（Cloud Run, API Gatewayなど）は、
    // 利用する前にプロジェクト単位で「有効化」する必要があります。
    // このコンポーネントは、指定されたサービスのリストをループ処理し、
    // それぞれを有効化するリソースを作成します。
    const _services: Record<string, gcp.projects.Service> = {};

    for (const service of args.services) {
      _services[service] = new gcp.projects.Service(
        `enable-${service}`,
        {
          service,
          project: args.project,
          disableDependentServices: true,
          // `disableOnDestroy: false` は、`pulumi destroy`を実行した際に、
          // 一度有効化したサービスを無効化しないようにする設定です。
          // これにより、他のリソースがまだ使っているサービスを誤って無効化する事故を防ぎます。
          disableOnDestroy: false,
        },
        { parent: this },
      );
    }

    this.services = _services;
  }
}
