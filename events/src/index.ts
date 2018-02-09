/**
 * @leizm/distributed-events
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import * as events from "events";
import * as Redis from "ioredis";
import * as createDebug from "debug";

export interface Options {
  /** Redis连接配置 */
  redis?: Redis.RedisOptions;
  /** 键前缀，默认空 */
  keyPrefix?: string;
  /** 频道名称，默认为"events"，如果设置了前缀则会加上前缀 */
  channelKey?: string;
}

export const COUNTER_SYMBOL = Symbol("counter");
export const READY_EVENT_SYMBOL = Symbol("ready event");

export default class EventEmitter {
  protected static [COUNTER_SYMBOL]: number = 0;

  protected readonly id: string = `${Date.now()}.${
    process.pid
  }.${Math.random()}`;
  protected readonly debug: debug.IDebugger;
  protected readonly event: events.EventEmitter = new events.EventEmitter();
  protected readonly channelKey: string;
  protected readonly redisSub: Redis.Redis;
  protected readonly redisPub: Redis.Redis;
  protected isReady: boolean = false;

  constructor(options?: Options) {
    options = options || {};
    EventEmitter[COUNTER_SYMBOL]++;
    this.debug = createDebug(
      `@leizm:distributed-events:#${EventEmitter[COUNTER_SYMBOL]}`
    );

    this.channelKey = options.channelKey || "events";
    if (options.keyPrefix) {
      this.channelKey = options.keyPrefix + this.channelKey;
    }

    this.redisSub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisSub.select(options.redis.db);
    }
    this.redisSub.on("error", err => {
      this.debug("redisSub.onerror => %s", err);
      this.event.emit("error", err);
    });
    this.redisSub.on("message", (ch, str) => {
      this.debug("redisSub.onmessage => ch=%s str=%s", ch, str);
      if (ch === this.channelKey) {
        let data: {
          e: string;
          a: any;
        };
        try {
          data = JSON.parse(str);
        } catch (err) {
          this.debug("redisSub.onmessage => JSON.parse %s", err);
          return;
        }
        this.event.emit(data.e, ...data.a);
      }
    });
    this.redisSub.subscribe(this.channelKey, () => {
      this.debug("redisSub.subscribe.ready");
      this.isReady = true;
      this.event.emit(READY_EVENT_SYMBOL);
    });

    this.redisPub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisPub.select(options.redis.db);
    }
    this.redisPub.on("error", err => {
      this.debug("redisPub.on(error) => %s", err);
      this.event.emit("error", err);
    });
  }

  /**
   * 监听事件
   * @param event 时间名称
   * @param listener 监听器函数
   */
  public on(event: string, listener: (...args: any[]) => void): this {
    this.debug("on(%s) => %s", event, listener);
    this.event.on(event, listener);
    return this;
  }

  /**
   * 监听事件
   * @param event 时间名称
   * @param listener 监听器函数
   */
  public once(event: string, listener: (...args: any[]) => void): this {
    this.debug("on(%s) => %s", event, listener);
    this.event.once(event, listener);
    return this;
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 参数
   */
  public emit(event: string, ...args: any[]): this {
    this.redisPub.publish(
      this.channelKey,
      JSON.stringify({ e: event, a: args })
    );
    return this;
  }

  /**
   * 等待就绪
   */
  public ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReady) return resolve();
      this.event.once(READY_EVENT_SYMBOL, resolve);
    });
  }

  /**
   * 销毁
   */
  public destroy() {
    this.redisPub.disconnect();
    this.redisSub.disconnect();
  }
}
