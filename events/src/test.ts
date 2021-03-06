/**
 * @leizm/distributed-events
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { expect } from "chai";
import EventEmitter from "./index";

describe("test @leizm/distributed-events", function() {
  it("base", function(done) {
    const e = new EventEmitter({ redis: { db: 0 } });
    e.on("hello", (a: number, b: number, c: number) => {
      expect(a + b).to.equal(c);

      e.destroy();
      done();
    });
    e
      .ready()
      .then(() => {
        e.emit("hello", 4, 5, 9);
      })
      .catch(done);
  });

  it("once", function(done) {
    const e = new EventEmitter({ redis: { db: 1 } });
    e.once("hello", (a: number, b: number, c: number) => {
      expect(a + b).to.equal(c);

      e.once("hello", (a: number, b: number) => {
        expect(a).to.equal(b);

        e.destroy();
        done();
      });
      e.emit("hello", 3, 3);
    });
    e
      .ready()
      .then(() => {
        e.emit("hello", 4, 5, 9);
      })
      .catch(done);
  });

  it("multi clients & multi methods", function(done) {
    const e1 = new EventEmitter();
    const e2 = new EventEmitter();
    e1.on("hello", (s: string) => {
      expect(s).to.equal("world");

      e1.destroy();
      e2.destroy();
      done();
    });
    e1
      .ready()
      .then(() => e2.ready())
      .then(() => {
        e2.emit("hello", "world");
      })
      .catch(done);
  });

  it("delay", function(done) {
    const e = new EventEmitter();
    const max = 1000;
    const ts: number[] = [];
    e.on("call", (i: number, t: number) => {
      ts[i] = process.uptime() - t;
      if (i === max - 1) {
        ts.forEach(v => expect(v).to.lessThan(0.01));

        e.destroy();
        done();
      }
    });
    const sleep = (ms: number) => {
      return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
      });
    };
    e
      .ready()
      .then(async () => {
        for (let i = 0; i < max; i++) {
          await sleep(1);
          e.emit("call", i, process.uptime());
        }
      })
      .catch(done);
  });

  it("private", function(done) {
    const e1 = new EventEmitter();
    const e2 = new EventEmitter();
    expect(e1.id).not.equal(e2.id);
    Promise.all([e1.ready(), e2.ready()])
      .then(() => {
        const list: any[] = [];
        e1.onPrivate((sid, ...data) => {
          expect(sid).to.equal(e2.id);
          list.push(data);
        });
        e1.on("end", () => {
          expect(list).to.deep.equal([
            [123, 456],
            ["a"],
            [true, false, null, 789]
          ]);

          e1.destroy();
          e2.destroy();
          done();
        });
        e2.sendPrivate(e1.id, 123, 456);
        e2.sendPrivate(e1.id, "a");
        e2.sendPrivate(e1.id, true, false, null, 789);
        e2.emit("end");
      })
      .catch(done);
  });
});
