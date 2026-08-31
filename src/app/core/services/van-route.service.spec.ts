import { VanRouteService } from './van-route.service';
import { GeoPoint, VanVisit } from '../../models/van-journey.model';

/** A stop with only the fields sequencing reads — the rest is noise here. */
function stop(id: number, lat: number, lng: number): VanVisit {
  return {
    id,
    account: `CU-${id}`,
    name: `Stop ${id}`,
    eta: '',
    window: '',
    mode: 'cod',
    balance: 0,
    limit: 0,
    status: 'pending',
    checkedIn: false,
    address: '',
    geo: { lat, lng },
  };
}

const ORIGIN: GeoPoint = { lat: 30, lng: 31 };

describe('VanRouteService', () => {
  let service: VanRouteService;

  beforeEach(() => (service = new VanRouteService()));

  describe('distanceKm', () => {
    it('measures a known separation', () => {
      // A tenth of a degree of latitude is ~11.1 km anywhere on Earth.
      const km = service.distanceKm({ lat: 30, lng: 31 }, { lat: 30.1, lng: 31 });
      expect(km).toBeCloseTo(11.12, 1);
    });

    it('is zero for a point against itself', () => {
      expect(service.distanceKm(ORIGIN, ORIGIN)).toBe(0);
    });

    it('is symmetric', () => {
      const a = { lat: 30.05, lng: 31.2 };
      const b = { lat: 29.97, lng: 30.94 };
      expect(service.distanceKm(a, b)).toBeCloseTo(service.distanceKm(b, a), 9);
    });
  });

  describe('nearestFirst', () => {
    it('orders by distance from the origin, nearest to farthest', () => {
      const far = stop(1, 30.5, 31);
      const near = stop(2, 30.02, 31);
      const middle = stop(3, 30.2, 31);

      const order = service.nearestFirst(ORIGIN, [far, near, middle]);

      expect(order.map((v) => v.id)).toEqual([2, 3, 1]);
    });

    it('leaves the input array alone', () => {
      const input = [stop(1, 30.5, 31), stop(2, 30.02, 31)];
      service.nearestFirst(ORIGIN, input);
      expect(input.map((v) => v.id)).toEqual([1, 2]);
    });
  });

  describe('optimize', () => {
    it('is never longer than the nearest-first order', () => {
      // Four corners of a square. Nearest-first walks to whichever corner is
      // closest each time and has to cross the square to finish; the shortest
      // route goes round the edge. This is the case the two modes disagree on.
      const stops = [
        stop(1, 30.0, 31.0),
        stop(2, 30.0, 31.1),
        stop(3, 30.1, 31.1),
        stop(4, 30.1, 31.0),
      ];
      const origin: GeoPoint = { lat: 29.99, lng: 30.99 };

      const nearestKm = service.measure(
        origin,
        service.nearestFirst(origin, stops)
      ).totalKm;
      const optimizedKm = service.measure(
        origin,
        service.optimize(origin, stops)
      ).totalKm;

      expect(optimizedKm).toBeLessThanOrEqual(nearestKm + 1e-9);
    });

    it('never drops or duplicates a stop', () => {
      const stops = [
        stop(1, 30.06, 31.2),
        stop(2, 30.04, 31.21),
        stop(3, 30.01, 31.18),
        stop(4, 29.98, 30.94),
        stop(5, 30.06, 31.2),
      ];

      const ids = service.optimize(ORIGIN, stops).map((v) => v.id).sort();

      expect(ids).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles an empty and a single-stop route', () => {
      expect(service.optimize(ORIGIN, [])).toEqual([]);
      expect(service.optimize(ORIGIN, [stop(1, 30.1, 31)]).map((v) => v.id)).toEqual([1]);
    });

    it('terminates when every stop sits at the same position', () => {
      const stops = [stop(1, 30, 31), stop(2, 30, 31), stop(3, 30, 31)];
      expect(service.optimize(ORIGIN, stops).length).toBe(3);
    });
  });

  describe('measure', () => {
    it('accumulates leg distances into a running total', () => {
      const stops = [stop(1, 30.1, 31), stop(2, 30.2, 31)];

      const plan = service.measure(ORIGIN, stops);

      expect(plan.legs[0].km).toBeCloseTo(11.12, 1);
      expect(plan.legs[1].km).toBeCloseTo(11.12, 1);
      expect(plan.legs[1].cumulativeKm).toBeCloseTo(plan.totalKm, 9);
      expect(plan.totalKm).toBeCloseTo(22.24, 1);
    });

    it('measures the order given, without reordering it', () => {
      const stops = [stop(1, 30.5, 31), stop(2, 30.02, 31)];
      expect(service.measure(ORIGIN, stops).legs.map((l) => l.visit.id)).toEqual([1, 2]);
    });
  });

  describe('measure with a resequenced round', () => {
    it('measures from the origin given, not from the planned first stop', () => {
      // The bug this guards: taking the origin as "the last done stop in
      // planned order" puts the van at whichever finished stop sits latest in
      // the plan, which on a resequenced round is not where it is.
      const stops = [stop(1, 30.2, 31), stop(2, 30.3, 31)];

      const fromNear = service.measure({ lat: 30.19, lng: 31 }, stops).totalKm;
      const fromFar = service.measure({ lat: 29.5, lng: 31 }, stops).totalKm;

      expect(fromNear).toBeLessThan(fromFar);
    });
  });

  describe('sequence', () => {
    it('returns the planned order untouched', () => {
      const stops = [stop(1, 30.5, 31), stop(2, 30.02, 31)];
      expect(service.sequence('planned', ORIGIN, stops).map((v) => v.id)).toEqual([1, 2]);
    });

    it('delegates the other modes', () => {
      const stops = [stop(1, 30.5, 31), stop(2, 30.02, 31)];
      expect(service.sequence('nearest', ORIGIN, stops).map((v) => v.id)).toEqual([2, 1]);
      expect(service.sequence('optimized', ORIGIN, stops).map((v) => v.id)).toEqual([2, 1]);
    });
  });
});
