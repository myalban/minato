importScripts(
    '../util/common.js',
    '../util/db.js',
    '../util/hash.js',
    '../util/crypto.js'
);

importScripts(
    './wallet.js',
    './transaction/tx.js',
    './transaction/txPool.js',
    './block.js',
    './blockchain.js',
    './p2p.js'
);

this.isMining = false;

const init = async () => {
    console.log('MINATO VERSION 0.0.1');

    await Database.open('hokage4', 1, () => {
        Database.createStore('blockchain', 'index');
        Database.createStore('transaction', 'id');
        Database.createStore('wallet');
    });

    await Wallet.initWallet();

    await initBlockchain();

    this.postMessage({ 'cmd': 'init', 'msg': Wallet.getPublicFromWallet() });
};


let nodePort = null;

const generateNextBlock = async () => {
    const address = Wallet.getPublicFromWallet();
    const coinbaseTx = await getCoinbaseTransaction(address, getLatestBlock()['index'] + 1);
    const blockData = [coinbaseTx].concat(getTransactionPool());

    const previousBlock = getLatestBlock();

    let block = {
        'index': previousBlock['index'] + 1,
        'hash': '',
        'previousHash': previousBlock['hash'],
        'timestamp': getCurrentTimestamp(),
        'data': blockData,
        'difficulty': getDifficulty(getBlockchain()),
        'nonce': 0
    };

    return block;
};

const onMessageFromMiner = async (event) => {
    const data = event.data;
    switch (data['cmd']) {
        case 'newblock': {
            // generate Raw Next Block
            let block = data['block'];
            if (await addBlockToChain(block)) {
                broadcast(responseLatestMsg());

                const newBlock = await generateNextBlock();
                nodePort.postMessage({ 'cmd': 'mine', 'block': newBlock });
            }
        }
            break;
        case 'mine': {
            const newBlock = await generateNextBlock();
            nodePort.postMessage({ 'cmd': 'mine', 'block': newBlock });
        }
            break;
        default:
            break;
    }
};

this.onmessage = async (event) => {
    const data = event.data;
    switch (data['cmd']) {
        case 'connect':
            nodePort = event.ports[0];
            nodePort.onmessage = onMessageFromMiner;
            break;
        case 'init':
            await init();
            break;
        case 'mine': {
            // worker to miner 
            const newBlock = await generateNextBlock();
            nodePort.postMessage({ 'cmd': 'mine', 'block': newBlock });
        }
            break;
        case 'sendTransaction':
            await sendTransaction(data['address'], data['amount']);
            broadcast(responseTransactionPoolMsg());
            break;
        case 'p2p':
            switch (data['type']) {
                case 'open':
                    this.postMessage({ 'cmd': 'p2p', 'msg': [data['id'], queryLatestMsg()] });

                    setTimeout(() => {
                        broadcast(queryTransactionPoolMsg());
                    }, 500);
                    break;
                case 'data':
                    await messageHandler(data['id'], data['msg']);
                    break;
            }
            break;
        default:
            console.log(data);
            break;
    }
}

//let WebSocket = this.WebSocket || this.MozWebSocket;
//let RTCPeerConnection = this.RTCPeerConnection || this.mozRTCPeerConnection || this.webkitRTCPeerConnection;

//let iiii = 0;
