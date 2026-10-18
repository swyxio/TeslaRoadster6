import { dimensions } from './physics';
import type { Entity } from './game';

/** Mutable broadphase: exact collision response remains in the shared simulation. */
export class EntityIndex {
  private readonly cellSize = 32;
  private readonly cells = new Map<string, Set<number>>();
  private readonly memberships: string[][];

  constructor(private readonly entities: Entity[]) {
    this.memberships = entities.map(() => []);
    entities.forEach((_, i) => this.update(i));
  }

  private keys(entity: Entity): string[] {
    const size = dimensions(entity.kind);
    const cos = Math.abs(Math.cos(entity.yaw)), sin = Math.abs(Math.sin(entity.yaw));
    const rx = (cos * size.width + sin * size.length) / 2;
    const rz = (sin * size.width + cos * size.length) / 2;
    const keys: string[] = [];
    for (let x = Math.floor((entity.x - rx) / this.cellSize); x <= Math.floor((entity.x + rx) / this.cellSize); x++) {
      for (let z = Math.floor((entity.z - rz) / this.cellSize); z <= Math.floor((entity.z + rz) / this.cellSize); z++) keys.push(`${x},${z}`);
    }
    return keys;
  }

  update(index: number): void {
    for (const key of this.memberships[index]) {
      const cell = this.cells.get(key)!;
      cell.delete(index);
      if (!cell.size) this.cells.delete(key);
    }
    const keys = this.keys(this.entities[index]);
    this.memberships[index] = keys;
    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = new Set());
      cell.add(index);
    }
  }

  candidates(index: number, after: number): number[] {
    const found = new Set<number>();
    for (const key of this.memberships[index]) for (const other of this.cells.get(key) ?? []) if (other > after) found.add(other);
    return [...found].sort((a, b) => a - b);
  }
}
