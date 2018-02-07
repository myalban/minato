importScripts(
    './util/common.js',
    './util/db.js',
    './util/hash.js',
    './util/elliptic.js'
);

importScripts(
    './core/wallet.js',
    './core/transaction/tx.js',
    './core/transaction/txPool.js',
    './core/block.js',
    './core/blockchain.js',
    './core/p2p.js'
);

const init = async () => {
    console.log('MINATO VERSION 0.0.1');

    await Database.open('hokage4', 1, () => {
        Database.createStore('blockchain', 'index');
        Database.createStore('transaction', 'id');
        Database.createStore('wallet');
    });

    await Wallet.initWallet();

    await initBlockchain();

    this.postMessage({ 'cmd': 'init', 'msg': 'success', 'public': Wallet.getPublicFromWallet() });
};

const mining = async () => {
    const newBlock = await generateNextBlock();
    if (newBlock === null) {
        console.log('could not generate block');
    } else {
        broadcast(responseLatestMsg());
    }
};

self.onmessage = async (event) => {
    const data = event.data;
    switch (data['cmd']) {
        case 'init':
            (async () => {
                await init();
            })().catch((e) => {
                console.log(e);
            });
            break;
        case 'mining':
            (async () => {
                await mining();
            })();
            break;
        case 'sendTransaction':
            await sendTransaction(data['address'], data['amount']);
            broadcast(responseTransactionPoolMsg());
            break;
        case 'p2p':
            switch (data['type']) {
                case 'open':
                    this.postMessage({ 'cmd': 'p2p', 'id': data['id'], 'msg': queryLatestMsg() });

                    setTimeout(() => {
                        broadcast(queryTransactionPoolMsg());
                    }, 500);
                    break;
                case 'data':
                    await messageHandler(data['id'], data['msg']);
                    break;
            }
    }
}
