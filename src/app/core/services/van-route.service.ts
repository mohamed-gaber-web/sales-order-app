import { Injectable } from '@angular/core';
import { GeoPoint, VanVisit } from '../../models/van-journey.model';

/** One stop in a sequenced route, with the drive that reaches it. */
export interface RouteLeg {
  visit: VanVisit;
  /** Straight-line km from the previous point (the origin, for the first). */
  km: number;
  /** Straight-line km from the origin along the whole sequence so far. */
  cumulativeKm: number;
}

/** A sequence of stops and what it costs to drive it. */
export interface RoutePlan {
  legs: RouteLeg[];
  totalKm: number;
}

/** How the remaining stops are sequenced. */
export type RouteMode = 'planned' | 'nearest' | 'optimized';

/** Mean Earth radius, km. */
const EARTH_RADIUS_KM = 6371;

/**
 * Ceiling on 2-opt passes.
 *
 * The loop already terminates — every accepted swap strictly shortens the path,
 * and there are finitely many orderings — but a bound means a pathological set
 * of stops (many points at an identical position, say) cannot hold the UI
 * thread while it grinds. A route this size converges in two or three passes.
 */
const MAX_TWO_OPT_PASSES = 50;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Sequences a day's stops.
 *
 * Two different questions get asked of a route, and they have different
 * answers, so both are offered rather than one being passed off as the other:
 *
 * - **Nearest first** sorts the stops by how far each is from the driver right
 *   now. It answers "what is closest to me", and the far ones fall to the end.
 *   It is not the shortest way round — servicing the two nearest stops first
 *   can strand a third out on its own.
 * - **Optimized** sequences the whole remaining round for the least total
 *   driving, which is the question that saves fuel and hours. Its first stop is
 *   usually, but not always, the nearest one.
 *
 * Distances are straight-line (haversine), not road distance. That is a real
 * limitation and worth stating plainly: across a river or a closed road the
 * ordering can be wrong, and only a routing API with real road geometry fixes
 * it. Within a delivery zone the two agree closely enough to sequence by, and
 * this needs no network, no key, and no per-request cost on a van that may be
 * on a weak mobile connection.
 */
@Injectable({ providedIn: 'root' })
export class VanRouteService {
  /**
   * Great-circle distance in km.
   *
   * Haversine rather than the cheaper equirectangular approximation: the cost
   * difference is meaningless for a few dozen points, and haversine stays
   * correct at any latitude and across the date line, where the approximation
   * quietly does not.
   */
  distanceKm(a: GeoPoint, b: GeoPoint): number {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Measures a sequence as given, without reordering it. */
  measure(origin: GeoPoint, visits: VanVisit[]): RoutePlan {
    let previous = origin;
    let cumulativeKm = 0;

    const legs = visits.map((visit) => {
      const km = this.distanceKm(previous, visit.geo);
      cumulativeKm += km;
      previous = visit.geo;
      return { visit, km, cumulativeKm };
    });

    return { legs, totalKm: cumulativeKm };
  }

  /** Stops sorted by distance from the origin — nearest first, farthest last. */
  nearestFirst(origin: GeoPoint, visits: VanVisit[]): VanVisit[] {
    return [...visits].sort(
      (a, b) => this.distanceKm(origin, a.geo) - this.distanceKm(origin, b.geo)
    );
  }

  /**
   * The shortest round we can find over these stops, starting from the origin.
   *
   * Nearest-neighbour to build a first sequence, then 2-opt to repair it. The
   * pairing is deliberate: nearest-neighbour is fast and gives a sensible route
   * except for its known failure — it takes the cheap hop every time and leaves
   * stragglers that cost a long run at the end — and 2-opt exists precisely to
   * undo that by un-crossing the path. Together they land within a few percent
   * of optimal on a delivery round, which is well inside the error that
   * straight-line distance already carries.
   *
   * Not a true TSP solve, and it does not try to be: exact solutions are
   * exponential, and a driver needs an answer before they pull away.
   *
   * The route is open — it sequences the way out and does not cost the run back
   * to the depot, because a van sales day ends at a day-close that may or may
   * not be at the branch.
   */
  optimize(origin: GeoPoint, visits: VanVisit[]): VanVisit[] {
    if (visits.length < 2) return [...visits];
    return this.twoOpt(origin, this.nearestNeighbour(origin, visits));
  }

  /** Sequences by `mode`, leaving `planned` untouched. */
  sequence(mode: RouteMode, origin: GeoPoint, visits: VanVisit[]): VanVisit[] {
    if (mode === 'nearest') return this.nearestFirst(origin, visits);
    if (mode === 'optimized') return this.optimize(origin, visits);
    return [...visits];
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Repeatedly hop to the closest stop not yet taken. */
  private nearestNeighbour(origin: GeoPoint, visits: VanVisit[]): VanVisit[] {
    const remaining = [...visits];
    const order: VanVisit[] = [];
    let here = origin;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestKm = Infinity;

      remaining.forEach((visit, index) => {
        const km = this.distanceKm(here, visit.geo);
        if (km < bestKm) {
          bestKm = km;
          bestIndex = index;
        }
      });

      const [next] = remaining.splice(bestIndex, 1);
      order.push(next);
      here = next.geo;
    }

    return order;
  }

  /**
   * 2-opt: reverse any stretch of the route that shortens it.
   *
   * Geometrically, every accepted reversal removes a crossing — the classic
   * signature of a nearest-neighbour route doubling back on itself.
   */
  private twoOpt(origin: GeoPoint, order: VanVisit[]): VanVisit[] {
    let best = [...order];
    let bestKm = this.pathKm(origin, best);

    for (let pass = 0; pass < MAX_TWO_OPT_PASSES; pass++) {
      let improved = false;

      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const candidate = [
            ...best.slice(0, i),
            ...best.slice(i, j + 1).reverse(),
            ...best.slice(j + 1),
          ];
          const km = this.pathKm(origin, candidate);
          // A margin, not `<`: floating-point noise on equal-length routes
          // would otherwise swap them back and forth until the pass cap.
          if (km < bestKm - 1e-9) {
            best = candidate;
            bestKm = km;
            improved = true;
          }
        }
      }

      if (!improved) break;
    }

    return best;
  }

  private pathKm(origin: GeoPoint, order: VanVisit[]): number {
    let previous = origin;
    let total = 0;
    for (const visit of order) {
      total += this.distanceKm(previous, visit.geo);
      previous = visit.geo;
    }
    return total;
  }
}
