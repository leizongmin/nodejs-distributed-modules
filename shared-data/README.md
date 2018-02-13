# 分布式事件监听触发模块 @leizm/distributed-shared-data

## 安装

```bash
npm install @leizm/distributed-shared-data --save
```

## 使用

```typescript
import SharedData from "@leizm/distributed-shared-data";

async function main() {
  // 创建实例
  const data = new SharedData({
    // Redis连接配置
    redis: {
      host: "127.0.0.1",
      port: 6379,
      password: "",
      db: 0
    },
    // 键前缀，默认空
    keyPrefix: "",
    // 频道名称，默认为":sync"，如果设置了前缀则会加上前缀
    channelKey: ":sync"
  });

  // 等待初始化完成
  await data.ready();

  // 设置值
  await data.set("a", 123);

  // 获取最新值
  const a = await data.get("a");

  // 获取当前缓存的值（如果值有变化，会自动同步，但可能在短时间内不一致）
  const b = data.getSync("b");

  // 值增减
  const c = await data.incr("c");
  const d = await data.decr("d");

  // 获取原始redis实例，通过 key() 和 stripKeyPrefix() 来添加删除键前缀
  const keys = (await data.redis.keys(data.key("*"))).map(k => data.stripKeyPredix(k));
}
```

## License

```text
MIT License

Copyright (c) 2018 Zongmin Lei <leizongmin@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
