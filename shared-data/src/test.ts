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
        await data.delete("x");

        const updates: any[][] = [];
        data.on("update", (k, v) => updates.push([k, v]));

        expect(await data.incr("x")).to.equal(1);
        expect(await data.incr("x")).to.equal(2);
        expect(await data.incr("x", 2)).to.equal(4);
        expect(await data.decr("x")).to.equal(3);
        expect(await data.decr("x")).to.equal(2);
        expect(await data.decr("x", 3)).to.equal(-1);

        await sleep(100);
        expect(updates).to.deep.equal([
          ["x", 1],
          ["x", 2],
          ["x", 4],
          ["x", 3],
          ["x", 2],
          ["x", -1]
        ]);

        data.destroy();
        done();
      })
      .catch(done);
  });

  it("delete", function(done) {
    const data = new SharedData({
      redis: { db: 1 }
    });
    data.ready().then(async () => {
      await data.set("abc", 123);
      await data.set("xyz", 456);

      expect(await data.get("abc")).to.equal(123);
      expect(await data.get("xyz")).to.equal(456);

      await data.delete("abc");

      expect(await data.get("abc")).to.equal(undefined);
      expect(await data.get("xyz")).to.equal(456);

      data.destroy();
      done();
    });
  });
});

function sleep(ms: number) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}
