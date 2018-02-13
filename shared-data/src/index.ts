/**
 * @leizm/distributed-shared-data
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import * as events from "events";
import * as Redis from "ioredis";
import * as createDebug from "debug";

export interface Options {
  /** Redis连接配置 */
  redis?: Redis.RedisOptions;
  /** 键前缀，默认"d:" */
  keyPrefix?: string;
  /** 频道名称，默认为":sync"，如果设置了前缀则会加上前缀 */
  channelKey?: string;
}

export const COUNTER_SYMBOL = Symbol("counter");
export const READY_EVENT_SYMBOL = Symbol("ready event");

export default class SharedData {
  protected static [COUNTER_SYMBOL]: number = 0;

  protected readonly id: string = `${Date.now()}.${
    process.pid
  }.${Math.random()}`;
  protected readonly debug: debug.IDebugger;
  protected readonly event: events.EventEmitter = new events.EventEmitter();
  protected readonly keyPrefix: string;
  protected readonly channelKey: string;
  protected readonly redisSub: Redis.Redis;
  protected readonly redisPub: Redis.Redis;
  protected readonly syncData: Map<string, any> = new Map();
  protected isReady: boolean = false;
  protected isInitSync: boolean = false;

  constructor(options?: Options) {
    options = options || {};
    SharedData[COUNTER_SYMBOL]++;
    this.debug = createDebug(
      `@leizm:distributed-shared-data:#${SharedData[COUNTER_SYMBOL]}`
    );

    this.keyPrefix = options.keyPrefix || "d:";
    this.channelKey = options.channelKey || ":sync";
    if (this.keyPrefix) {
      this.channelKey = this.keyPrefix + this.channelKey;
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
          k: string;
          i: string;
        };
        try {
          data = JSON.parse(str);
        } catch (err) {
          this.debug("redisSub.onmessage error: %s", err);
          this.event.emit("error", err);
          return;
        }
        // 如果同步请求来自当前客户端（通过ID判断），则忽略此次更新
        if (data.i === this.id) {
          this.debug("ignore sync: %j", data);
          return;
        }
        this.get(data.k).then(value => {
          this.debug("sync: %s=%j", data.k, value);
        });
      }
    });
    this.redisSub.subscribe(this.channelKey, () => {
      this.debug("redisSub.subscribe.ready");
      this.isReady = true;
      this.checkReady();
    });

    this.redisPub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisPub.select(options.redis.db);
    }
    this.redisSub.on("error", err => {
      this.debug("redisSub.on(error) => %s", err);
      this.event.emit("error", err);
    });

    // 初始化时自动全量同步数据
    let keys: string[];
    this.redisPub
      .keys("d:*")
      .then(ret => {
        keys = ret;
        if (keys.length < 1) return [];
        return this.redisPub.mget(...keys);
      })
      .then((values: string[]) => {
        values.forEach((v, i) => {
          const k = this.stripKeyPrefix(keys[i]);
          this.debug("init sync: %s=%j", k, v);
          try {
            v = JSON.parse(v);
          } catch (err) {
            const newErr = new TypeError(
              `sync data failed: key=${k}, value=${v}, ${err}`
            );
            this.debug(newErr);
            this.event.emit("error", newErr);
          }
          this.syncData.set(k, v);
        });
        this.isInitSync = true;
        this.debug("syncData.init.ready");
        this.checkReady();
      });

    this.debug("create: %s", this.id);
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
   * 等待就绪
   */
  public ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReady && this.isInitSync) return resolve();
      this.event.once(READY_EVENT_SYMBOL, resolve);
    });
  }

  /**
   * 检查是否就绪
   */
  protected checkReady() {
    if (this.isReady && this.isInitSync) {
      this.event.emit(READY_EVENT_SYMBOL);
    }
  }

  /**
   * 销毁
   */
  public destroy() {
    this.redisPub.disconnect();
    this.redisSub.disconnect();
  }

  /**
   * 添加键前缀
   * @param key
   */
  public key(key: string): string {
    return this.keyPrefix + key;
  }

  /**
   * 去除键前缀
   * @param key
   */
  public stripKeyPrefix(key: string): string {
    return key.slice(this.keyPrefix.length);
  }

  /**
   * 发送同步数据事件
   * @param key
   * @param value
   */
  protected publishSyncDataEvent(key: string, value: any): Promise<any> {
    return this.redisPub.publish(
      this.channelKey,
      JSON.stringify({ k: key, i: this.id })
    ) as any;
  }

  /**
   * 获取原始Redis实例
   */
  public get redis() {
    return this.redisPub;
  }

  /**
   * 存储数据
   */
  public set(key: string, value: any): Promise<any> {
    this.debug("set %s=%j", key, value);
    const str = JSON.stringify(value);
    this.syncData.set(key, value);
    return this.redisPub
      .set(this.key(key), str)
      .then(() => this.publishSyncDataEvent(key, value))
      .then(() => value);
  }

  /**
   * 获取数据
   */
  public get(key: string): Promise<any> {
    if (this.syncData.has(key)) {
      return Promise.resolve(this.syncData.get(key));
    }
    return this.redisPub.get(this.key(key)).then(str => {
      const data = JSON.parse(str);
      this.syncData.set(key, data);
      return data;
    }) as any;
  }

  /**
   * 获取数据（同步），如果不存本地则返回undefined
   */
  public getSync(key: string): any {
    return this.syncData.get(key);
  }

  /**
   * 数值自增
   * @param key
   * @param increment
   */
  public incr(key: string, increment: number = 1): Promise<number> {
    this.debug("incr %s", key);
    return this.redisPub.incrby(this.key(key), increment).then((value: any) => {
      value = Number(value);
      this.syncData.set(key, value);
      return this.publishSyncDataEvent(key, value).then(() => value);
    }) as any;
  }

  /**
   * 数值自减
   * @param key
   * @param increment
   */
  public decr(key: string, increment: number = 1): Promise<number> {
    this.debug("decr %s %s", key, increment);
    return this.incr(key, -increment);
  }
}