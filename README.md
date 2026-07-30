# コルツセンター強盗 回収補助ツール v12

GitHub Pagesでそのまま公開できる静的Webツールです。
https://nikepiko.github.io/koltz-heist-helper/

## 地点種類の設定

地点ごとの種類は `config.js` の `SPOT\_TYPES` だけで管理します。

```js
'1f-01': 'small',
'2f-01': 'painting'
```

使用可能な値:

* `painting`
* `medium`
* `small`
* `reinforced`
* `main`（メインターゲット専用）
* 

