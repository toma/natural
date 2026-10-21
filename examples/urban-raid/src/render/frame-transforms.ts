import { SkinnedMesh, type Object3D, type Skeleton } from "three";

const preparedPalette = () => {
  /* Already updated for this submission scope. */
};

/** Synchronous scope covering shadow, prepass and forward submissions only. */
export class FrameTransforms {
  private readonly skeletons = new Set<Skeleton>();
  private readonly restores: Array<() => void> = [];

  run<T>(roots: Object3D[], draw: () => T): T {
    try {
      for (const root of roots) {
        if (root.matrixWorldAutoUpdate) root.updateMatrixWorld();
        const auto = root.matrixWorldAutoUpdate;
        this.restores.push(() => {
          root.matrixWorldAutoUpdate = auto;
        });
        root.matrixWorldAutoUpdate = false;
        root.traverseVisible((object) => {
          if (!(object instanceof SkinnedMesh) || this.skeletons.has(object.skeleton)) return;
          const skeleton = object.skeleton;
          this.skeletons.add(skeleton);
          skeleton.update();
          const descriptor = Object.getOwnPropertyDescriptor(skeleton, "update");
          this.restores.push(() => {
            if (descriptor) Object.defineProperty(skeleton, "update", descriptor);
            else Reflect.deleteProperty(skeleton, "update");
          });
          skeleton.update = preparedPalette;
        });
      }
      return draw();
    } finally {
      for (let i = this.restores.length - 1; i >= 0; i--) this.restores[i]!();
      this.restores.length = 0;
      this.skeletons.clear();
    }
  }
}
