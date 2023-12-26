/* ALGORI Javascript版 デモプレイヤー */
/*
 * <ルール>
 * 1. 命名規則を守る！
 * 普通の変数(var, let)や、普通の関数(function)は小文字で宣言する
 * 変数名を複数単語にする場合は、単語間の境目のみを大文字にする
 * 例："let value;", "let anyFloatNumber;", "function deleteAll() { }"
 * 定数(const)は全て大文字で宣言する
 * 単語の境目はアンダーバーで区切る
 * 例："const LUCKY_ITEM"
 * 2. コメントアウトはしっかり！
 * 基本的に他人のプログラムなんてものはさっぱりわからないことが普通なので、
 * 他の人のことを考えて要点をしっかり記述すること
 * 3. その他注意事項
 * コードのインデントは十分空けること
 * もし、中かっこの位置が気に入らなければ上手く改行を入れてもいい
 * VSCodeで記法チェックなどがしたければ、このソースコードの
 * 1行目に「// @ts-check」とコメントアウトするとよい
 * 恐らくモジュール系のエラーが大量に表示されるけど･･･
*/

// ---- 使用モジュールのインポート ---- //

/** 
 * WebSocketのクライアント 
 * （ALGORIで使うデモプレイヤーのはたらき）
 * 
 * https://qiita.com/sey323/items/ba29376b8aa6a4e77fce
*/
const SOCKET_IO_CLIENT = require('socket.io-client');

/**
 * 非同期処理を扱う
 * 
 * BluebirdはJSの非同期処理の仕組み「Promise」を手軽に扱うためのライブラリ
 * https://qiita.com/cheez921/items/41b744e4e002b966391a
*/
const BLUEBIRD = require('bluebird');

// ---- 定数 ---- //

/* 
 * データタイプとイベント
 * 詳細は公式PDF(development-kit\document\spec.pdf) の「5.データ通信仕様について」を参照する
*/

/** Socket通信の全イベント名 */
const EVENTS = {
  EMIT: {
    JOIN_ROOM: 'join-room', // 試合参加
    RECEIVER_CARD: 'receiver-card', // カードの配布
    FIRST_PLAYER: 'first-player', // 対戦開始
    COLOR_OF_WILD: 'color-of-wild', // 場札の色を変更する
    UPDATE_COLOR: 'update-color', // 場札の色が変更された
    SHUFFLE_WILD: 'shuffle-wild', // シャッフルしたカードの配布
    NEXT_PLAYER: 'next-player', // 自分の手番
    PLAY_CARD: 'play-card', // カードを出す
    DRAW_CARD: 'draw-card', // カードを山札から引く
    PLAY_DRAW_CARD: 'play-draw-card', // 山札から引いたカードを出す
    CHALLENGE: 'challenge', // チャレンジ
    PUBLIC_CARD: 'public-card', // 手札の公開
    POINTED_NOT_SAY_UNO: 'pointed-not-say-uno', // UNO宣言漏れの指摘
    SPECIAL_LOGIC: 'special-logic', // スペシャルロジック
    FINISH_TURN: 'finish-turn', // 対戦終了
    FINISH_GAME: 'finish-game', // 試合終了
    PENALTY: 'penalty', // ペナルティ
  },
};

/** UNOのカードの色 */
const CARD_COLORS = {
  RED: 'red', // 赤
  YELLOW: 'yellow', // 黄
  GREEN: 'green', // 緑
  BLUE: 'blue', // 青
  BLACK: 'black', // 黒
  WHITE: 'white', // 白
};

/** UNOの記号カード種類 */
const SPECIAL_CARDS = {
  SKIP: 'skip', // スキップ
  REVERSE: 'reverse', // リバース
  DRAW_2: 'draw_2', // ドロー2
  WILD: 'wild', // ワイルド
  WILD_DRAW_4: 'wild_draw_4', // ワイルドドロー4
  WILD_SHUFFLE: 'wild_shuffle', // シャッフルワイルド
  WHITE_WILD: 'white_wild', // 白いワイルド
};

/** カードを引く理由 */
const DRAW_REASON = {
  DRAW_2: 'draw_2', // 直前のプレイヤーがドロー2を出した場合
  WILD_DRAW_4: 'wild_draw_4', // 直前のプレイヤーがワイルドドロー4を出した場合
  BIND_2: 'bind_2', // 直前のプレイヤーが白いワイルド（バインド2）を出した場合
  SKIP_BIND_2: 'skip_bind_2', // 直前のプレイヤーが白いワイルド（スキップバインド2）を出した場合
  NOTHING: 'nothing', // 理由なし
};

/** 色変更の選択肢 */
const CARD_COLOR_SELECTS = [CARD_COLORS.RED, CARD_COLORS.YELLOW, CARD_COLORS.BLUE, CARD_COLORS.GREEN];


/** 実行確認用 */
// processはNodeの状態を取得したり操作したりするためのモジュール
// argvで、デモプレイヤー起動時にコマンドラインに入力した引数を受け取る
// docker run javascript-demo-player (HOST) (ROOM_NAME) (PLAYER_NAME) (EVENT_NAME) に対応する

/** 
 * 接続先（ディーラープログラム or 開発ガイドラインツール）
 * @type string
*/
const HOST = process.argv[2] || '';

/** 
 * ディーラー名
 * @type string
*/
const DEELER_NAME = process.argv[3] || '';

/**
 * プレイヤー名 
 * @type string
 * */
const PLAYER_NAME = process.argv[4] || '';

/** Socket通信イベント名 */
const EVENT_NAME = process.argv[5];

/** 接続先が開発ガイドラインツールであるかを判定 */
const IS_TESTTOOL = HOST.includes(TEST_TOOL_HOST_PORT);

/** スペシャルロジック名 */
const SPECIAL_LOGIC_TITLE = '◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯◯';

/** 処理停止時間 */
const TIME_DELAY = 10;

/** クライアント */
const CLIENT = SOCKET_IO_CLIENT.connect(HOST, { transports: ['websocket'], });

/* 開発ガイドライン用 */

/** 開発ガイドラインツールのポート番号 */
const TEST_TOOL_HOST_PORT = '3000';

/** 開発ガイドラインツールSTEP1で送信するサンプルデータ */
const TEST_TOOL_EVENT_DATA = {
  [EVENTS.EMIT.JOIN_ROOM]: {
    player: PLAYER_NAME,
    room_name: DEELER_NAME,
  },
  [EVENTS.EMIT.COLOR_OF_WILD]: {
    color_of_wild: 'red',
  },
  [EVENTS.EMIT.PLAY_CARD]: {
    card_play: { color: 'black', special: 'wild' },
    yell_uno: false,
    color_of_wild: 'blue',
  },
  [EVENTS.EMIT.DRAW_CARD]: {},
  [EVENTS.EMIT.PLAY_DRAW_CARD]: {
    is_play_card: true,
    yell_uno: true,
    color_of_wild: 'blue',
  },
  [EVENTS.EMIT.CHALLENGE]: {
    is_challenge: true,
  },
  [EVENTS.EMIT.POINTED_NOT_SAY_UNO]: {
    target: 'Player 1',
  },
  [EVENTS.EMIT.SPECIAL_LOGIC]: {
    title: SPECIAL_LOGIC_TITLE,
  },
};

// ---- 変数 ---- //

/** 自分のID */
let id = '';
/** 他のプレイヤーのUNO宣言状況 */
let unoDeclared = {};

// ---- 関数 ---- //

/** 
 * コマンドラインから受け取った引数を確認する 
 * 
 * エラーが起きた場合はプロセスを終了する
*/
function checkParameter() {
  if (!HOST) {
    // 接続先のhostが指定されていない場合はプロセスを終了する
    console.log('Host missed');
    process.exit();
  } else {
    console.log(`Host: ${HOST}`);
  }

  if (!DEELER_NAME || !PLAYER_NAME) {
    console.log('Arguments invalid');
    if (!IS_TESTTOOL) {
      // 接続先がディーラープログラムの場合はプロセスを終了する
      process.exit();
    }
  } else {
    console.log(`Dealer: ${DEELER_NAME}, Player: ${PLAYER_NAME}`);
  }
}

/**
 * 実行プロセスに接続する。
 * 試合時はディーラーに接続して試合に参加し、テストツールを試行する場合はそちら側に接続する。
 */
function connectProcess() {
  // プロセス起動時の処理。接続先によって振る舞いが異なる。
  if (IS_TESTTOOL) {
    // テストツールに接続
    if (!EVENT_NAME) {
      // イベント名の指定がない（開発ガイドラインSTEP2の受信のテストを行う時）
      console.log('Not found event name.');
    } else if (!TEST_TOOL_EVENT_DATA[EVENT_NAME]) {
      // イベント名の指定があり、テストデータが定義されていない場合はエラー
      console.log(`Undefined test data. eventName: ${EVENT_NAME}`);
    } else {
      // イベント名の指定があり、テストデータが定義されている場合は送信する(開発ガイドラインSTEP1の送信のテストを行う時)
      sendEvent(EVENT_NAME, TEST_TOOL_EVENT_DATA[EVENT_NAME]);
    }
  } else {
    // ディーラープログラムに接続
    const data = {
      room_name: DEELER_NAME,
      player: PLAYER_NAME,
    };

    // 試合に参加するイベントを実行
    sendEvent(EVENTS.EMIT.JOIN_ROOM, data, (res) => {
      console.log(`join-room res: ${JSON.stringify(res)}`);
      id = res.your_id;
      console.log(`My id is ${id}`);
    });
  }
}

/**
 * 出すカードを選出する。選出の優先順位、条件判断などについて検討が必要
 * @param cards 自分の手札
 * @param beforeCard 場札のカード
 */
function selectPlayCard(cards, beforeCard) {
  let cardsWild = []; // ワイルド・シャッフルワイルド・白いワイルドを格納
  let cardsWild4 = []; // ワイルドドロー4を格納
  let cardsValid = []; // 同じ色 または 同じ数字・記号 のカードを格納

  // 場札と照らし合わせ出せるカードを抽出する
  for (const card of cards) {
    // ワイルドドロー4は場札に関係なく出せる
    if (String(card.special) === SPECIAL_CARDS.WILD_DRAW_4) {
      cardsWild4.push(card);
    } else if (
      String(card.special) === SPECIAL_CARDS.WILD ||
      String(card.special) === SPECIAL_CARDS.WILD_SHUFFLE ||
      String(card.special) === SPECIAL_CARDS.WHITE_WILD
    ) {
      // ワイルド・シャッフルワイルド・白いワイルドも場札に関係なく出せる
      cardsWild.push(card);
    } else if (String(card.color) === String(beforeCard.color)) {
      // 場札と同じ色のカード
      cardsValid.push(card);
    } else if (
      (card.special && String(card.special) === String(beforeCard.special)) ||
      ((card.number || Number(card.number) === 0) &&
        Number(card.number) === Number(beforeCard.number))
    ) {
      // 場札と数字または記号が同じカード
      cardsValid.push(card);
    }
  }

  /**
   * 出せるカードのリストを結合し、先頭のカードを返却する
   * このプログラムでは優先順位を、「同じ色 または 同じ数字・記号」 > 「ワイルド・シャッフルワイルド・白いワイルド」 > ワイルドドロー4の順番とする
   * ワイルドドロー4は本来、手札に出せるカードが無い時に出していいカードであるため、一番優先順位を低くする
   * ワイルド・シャッフルワイルド・白いワイルドはいつでも出せるので、条件が揃わないと出せない「同じ色 または 同じ数字・記号」のカードより優先度を低くする
   */
  return cardsValid.concat(cardsWild).concat(cardsWild4)[0];
}

/**
 * 0~最大値までの乱数を取得する
 * @param num 最大値
 * @returns
 */
function randomByNumber(num) {
  return Math.floor(Math.random() * num);
}

/**
 * 変更する色を選出する
 * 
 * このサンプルプログラムでは変更する色をランダムで選択する。検討が必要
 */
function selectChangeColor() {
  // 変更する色をランダムで選択する
  return CARD_COLOR_SELECTS[randomByNumber(CARD_COLOR_SELECTS.length)];
}

/**
 * チャンレンジするかを決定する
 * 
 * このサンプルプログラムでは1/2の確率でチャレンジを行う。検討が必要
 */
function isChallenge() {
  // 1/2の確率でチャレンジを行う
  return !!randomByNumber(2);
}

/**
 * 他のプレイヤーのUNO宣言漏れをチェックする
 * @param numberCardOfPlayer
 * 各プレイヤーが所持している手札枚数の全データ。イベント時にコールバックされるオブジェクトデータの
 * 「number_card_of_player」に相当する
 */
async function checkUnoCall(numberCardOfPlayer) {
  let target;
  // 手札の枚数が1枚だけのプレイヤーを抽出する
  // 2枚以上所持しているプレイヤーはUNO宣言の状態をリセットする
  // ※numberCardOfPlayerは辞書なので、キーと値を記録する
  for (const [key, value] of Object.entries(numberCardOfPlayer)) {
    if (key === id) {
      // 自分のIDは処理しない
      break;
    } else if (value === 1) {
      // 1枚だけ所持しているプレイヤー
      target = key;
      break;
      // ※Array.indexOfが-1を返すのは配列に指定した要素が存在しなかったことを示す 
    } else if (Object.keys(unoDeclared).indexOf(key) > -1) {
      // 2枚以上所持しているプレイヤーはUNO宣言の状態をリセットする
      delete unoDeclared[key];
    }
  }

  if (!target) {
    // 1枚だけ所持しているプレイヤーがいない場合、処理を中断する
    return;
  }

  // 抽出したプレイヤーがUNO宣言を行っていない場合宣言漏れを指摘する
  if (Object.keys(unoDeclared).indexOf(target) === -1) {
    sendEvent(EVENTS.EMIT.POINTED_NOT_SAY_UNO, { target });
    await BLUEBIRD.delay(TIME_DELAY);
  }
}

/**
 * 送信イベント共通処理
 * @param {{}} event Socket通信イベント名
 * @param {{}} data 送信するデータ
 * @param callback 個別処理（コールバック関数）
 */
function sendEvent(event, data, callback) {
  console.log(`Send ${event} event.`);
  console.log(`req_data: ${JSON.stringify(data)}`);

  CLIENT.emit(event, data, (err, res) => {
    if (err) {
      // エラーをキャッチした場合ログを記録
      console.log(`Client ${event} failed!`);
      console.error(err);
      return;
    }

    console.log(`Client ${event} successfully!`);
    console.log(`res_data: ${JSON.stringify(res)}`);

    if (callback) {
      callback(res);
    }
  });
}

/**
 * 受信イベント共通処理
 * @param {{}} event Socket通信イベント名
 * @param {{}} data 受信するデータ
 * @param callback 個別処理（コールバック関数）
 */
function receiveEvent(event, data, callback) {
  console.log(`Receive ${event} event.`);
  console.log(`res_data: ${JSON.stringify(data)}`);

  // 個別処理の指定がある場合は実行する
  if (callback) {
    callback();
  }
}

// スクリプト

connectProcess();

checkParameter();

/* クライアントからデータを受信したとき実行する関数をハンドラとして指定する */

// Socket通信の確立時、コンソールに出力する
CLIENT.on('connect', () => console.log('Client connect successfully!'));

// Socket通信の切断時、コンソールに最終的なデータを出力し、プロセスを終了する
CLIENT.on('disconnect', (dataRes) => {
  console.log('Client disconnect.');
  console.log(dataRes);
  // プロセスを終了する
  process.exit();
});

// Socket通信受信時に実行するUNOイベントのハンドラを登録
// 競技中にはUNOの様々なイベントが発生するが、そのタイミングでイベントに関わる現在の状況を
// 記録したデータがクライアントから送信されるので、それを受け取る。
// 固有のイベント名に対応してある特定のハンドラ（実行したい処理・関数をコールバック・アロー関数にしたもの）を
// 指定することによってイベント発火時にその処理が実行される仕組み。
// 全イベントと、その際送られてくるデータの詳細については、PDF（spec.pdf）のP29以降を参照。

// イベントによって引数が違うので、1つずつon関数を記述しないといけない。面倒。

// プレイヤーがゲームに参加
CLIENT.on(EVENTS.EMIT.JOIN_ROOM, (dataRes) => receiveEvent(EVENTS.EMIT.JOIN_ROOM, dataRes));

// カードが手札に追加された
CLIENT.on(EVENTS.EMIT.RECEIVER_CARD, (dataRes) => receiveEvent(EVENTS.EMIT.RECEIVER_CARD, dataRes));

// 対戦の開始
CLIENT.on(EVENTS.EMIT.FIRST_PLAYER, (dataRes) => receiveEvent(EVENTS.EMIT.FIRST_PLAYER, dataRes));

// 場札の色指定を要求
CLIENT.on(EVENTS.EMIT.COLOR_OF_WILD, (dataRes) => {
  receiveEvent(EVENTS.EMIT.COLOR_OF_WILD, dataRes, () => {
    const color = selectChangeColor();
    const data = {
      color_of_wild: color,
    };
    // 指定した色を場に反映させる
    sendEvent(EVENTS.EMIT.COLOR_OF_WILD, data);
  });
});

// 場札の色が変わった
CLIENT.on(EVENTS.EMIT.UPDATE_COLOR, (dataRes) => receiveEvent(EVENTS.EMIT.UPDATE_COLOR, dataRes));

// シャッフルワイルドにより手札状況が変更
CLIENT.on(EVENTS.EMIT.SHUFFLE_WILD, (dataRes) => {
  receiveEvent(EVENTS.EMIT.SHUFFLE_WILD, dataRes),
  // シャッフルされたときに相手の手札が変わったのを自分のプログラム内の情報として記録し直している
  // わかりにくさはある
  () => {
    Object.keys(dataRes.number_card_of_player).forEach((player) => {
      if (dataRes.number_card_of_player[player] === 1) {
        // シャッフル後に1枚になったプレイヤーはUNO宣言を行ったこととする
        unoDeclared[player] = true;
      } else {
        // シャッフル後に2枚以上のカードが配られたプレイヤーはUNO宣言の状態をリセットする
        delete unoDeclared[player];
      }
    });
  };
});

// 自分の番
// 重要！！
CLIENT.on(EVENTS.EMIT.NEXT_PLAYER, (dataRes) => {
  // async, await は待機可能（非同期処理）の関数
  receiveEvent(EVENTS.EMIT.NEXT_PLAYER, dataRes, async () => {
    // UNO宣言が漏れているプレイヤーがいないかチェックする。
    // 該当するプレイヤーがいる場合は指摘する。
    await checkUnoCall(dataRes.number_card_of_player);

    const CARDS = dataRes.card_of_player;

    if (dataRes.draw_reason === DRAW_REASON.WILD_DRAW_4) {
      // カードを引く理由がワイルドドロー4の時、チャレンジを行うことができる。
      if (isChallenge()) {
        sendEvent(EVENTS.EMIT.CHALLENGE, { is_challenge: true });
        return;
      }
    }

    if (dataRes.must_call_draw_card) {
      // 引かなければいけない場合
      sendEvent(EVENTS.EMIT.DRAW_CARD, {});
      return;
    }

    // スペシャルロジックを発動させる
    // サンプルでは1/10で発動するように調整しているが
    // 本番では発動条件をしっかり考慮する
    const specialLogicNumRundom = randomByNumber(10); 
    if (specialLogicNumRundom === 0) {
      // ※スペシャルロジックを発動する場合はこの関数の第三引数にコールバックを書く！
      sendEvent(EVENTS.EMIT.SPECIAL_LOGIC, { title: SPECIAL_LOGIC_TITLE });
    }

    const playCard = selectPlayCard(CARDS, dataRes.card_before);
    if (playCard) {
      // 選出したカードがある時
      console.log(`selected card: ${JSON.stringify(playCard)}`);
      const data = {
        card_play: playCard,
        yell_uno: CARDS.length === 2, // 残り手札数を考慮してUNOコールを宣言する
      };

      // 出すカードがワイルドとワイルドドロー4の時は変更する色を指定する
      if (playCard.special === SPECIAL_CARDS.WILD || playCard.special === SPECIAL_CARDS.WILD_DRAW_4) {
        const color = selectChangeColor(); // 指定する色
        data.color_of_wild = color;
      }

      // カードを出すイベントを実行
      sendEvent(EVENTS.EMIT.PLAY_CARD, data);
    } else {
      // 選出したカードが無かった時

      // カードを引くイベントを実行
      sendEvent(EVENTS.EMIT.DRAW_CARD, {}, (res) => {
        if (!res.can_play_draw_card) {
          // 引いたカードが場に出せないので処理を終了
          return;
        }

        // 以後、引いたカードが場に出せるときの処理
        const data = {
          is_play_card: true,
          yell_uno: CARDS.concat(res.draw_card).length === 2, // 残り手札数を考慮してUNOコールを宣言する
        };

        const playCard = res.draw_card[0]; // 引いたカード。draw-cardイベントのcallbackデータは引いたカードのリスト形式であるため、配列の先頭を指定する。
        // 引いたカードがワイルドとワイルドドロー4の時は変更する色を指定する
        if (playCard.special === SPECIAL_CARDS.WILD || playCard.special === SPECIAL_CARDS.WILD_DRAW_4) {
          const color = selectChangeColor();
          data.color_of_wild = color;
        }

        // 引いたカードを出すイベントを実行
        sendEvent(EVENTS.EMIT.PLAY_DRAW_CARD, data);
      });
    }
  });
});

// カードが場に出た
CLIENT.on(EVENTS.EMIT.PLAY_CARD, (dataRes) => {
  receiveEvent(EVENTS.EMIT.PLAY_CARD, dataRes, () => {
    // UNO宣言を行った場合は記録する
    if (dataRes.yell_uno) {
      unoDeclared[dataRes.player] = true;
    }
  });
});

// 山札からカードを引いた
CLIENT.on(EVENTS.EMIT.DRAW_CARD, (dataRes) => {
  receiveEvent(EVENTS.EMIT.DRAW_CARD, dataRes, () => {
    // カードが増えているのでUNO宣言の状態をリセットする
    delete unoDeclared[dataRes.player];
  });
});

// 山札から引いたカードが場に出た
CLIENT.on(EVENTS.EMIT.PLAY_DRAW_CARD, (dataRes) => {
  receiveEvent(EVENTS.EMIT.PLAY_DRAW_CARD, dataRes, () => {
    // UNO宣言を行った場合は記録する
    if (dataRes.yell_uno) {
      unoDeclared[dataRes.player] = true;
    }
  });
});

// チャレンジの結果
CLIENT.on(EVENTS.EMIT.CHALLENGE, (dataRes) => receiveEvent(EVENTS.EMIT.CHALLENGE, dataRes));

// チャレンジによる手札の公開
CLIENT.on(EVENTS.EMIT.PUBLIC_CARD, (dataRes) => receiveEvent(EVENTS.EMIT.PUBLIC_CARD, dataRes));

// UNOコールを忘れていることを指摘
CLIENT.on(EVENTS.EMIT.POINTED_NOT_SAY_UNO, (dataRes) => receiveEvent(EVENTS.EMIT.POINTED_NOT_SAY_UNO, dataRes));

// 対戦が終了
CLIENT.on(EVENTS.EMIT.FINISH_TURN, (dataRes) => {
  receiveEvent(EVENTS.EMIT.FINISH_TURN, dataRes, () => {
    // 新しい対戦が始まるのでUNO宣言の状態をリセットする
    unoDeclared = {};
  });
});

// 試合が終了
CLIENT.on(EVENTS.EMIT.FINISH_GAME, (dataRes) => receiveEvent(EVENTS.EMIT.FINISH_GAME, dataRes));

// ペナルティ発生
CLIENT.on(EVENTS.EMIT.PENALTY, (dataRes) => {
  receiveEvent(EVENTS.EMIT.PENALTY, dataRes, () => {
    // カードが増えているのでUNO宣言の状態をリセットする
    delete unoDeclared[dataRes.player];
  });
});
