/**
 * @leizm/distributed-shared-data
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { expect } from "chai";
import SharedData from "./index";

describe("test @leizm/distributed-shared-data", function() {
  it("base", function(done) {
    const data = new SharedData({
      redis: { db: 1 }
    });
    data
      .ready()
      .then(async () => {
        await data.set("a", 123);
        await data.set("b", 456);
        {
          const a = await data.get("a");
          const b = await data.get("b");
          expect(a).to.equal(123);
          expect(b).to.equal(456);
        }

        await data.incr("a");
        await data.incr("b", 3);
        {
          const a = await data.get("a");
          const b = await data.get("b");
          expect(a).to.equal(124);
          expect(b).to.equal(459);
        }

        await data.decr("a");
        await data.decr("b", 3);
        {
          const a = await data.get("a");
          const b = await data.get("b");
          expect(a).to.equal(123);
          expect(b).to.equal(456);
        }

        expect(data.getSync("a")).to.equal(123);
        expect(data.getSync("b")).to.equal(456);

        data.destroy();
        done();
      })
      .catch(done);
  });

  it("cocurrent set()", function(done) {
    const data = new SharedData({
      redis: { db: 1 }
    });
    data
      .ready()
      .then(async () => {
        await Promise.all([
          data.set("a", 123),
          data.set("a", 456),
          data.set("a", 234),
          data.set("a", 567),
          data.set("a", 678),
          data.set("a", 789)
        ]);

        expect(data.getSync("a")).to.equal(789);
        const a = await data.get("a");
        expect(a).to.equal(789);

        data.destroy();
        done();
      })
      .catch(done);
  });

  it("incr & decr", function(done) {
    const data = new SharedData({
      redis: { db: 1 }
    });
    data
      .ready()
      .then(async () => {
        await data.redis.del(data.key('x'));

        expect(await data.incr("x")).to.equal(1);
        expect(await data.incr("x")).to.equal(2);
        expect(await data.incr("x", 2)).to.equal(4);
        expect(await data.decr("x")).to.equal(3);
        expect(await data.decr("x")).to.equal(2);
        expect(await data.decr("x", 3)).to.equal(-1);

        data.destroy();
        done();
      })
      .catch(done);
  });
});