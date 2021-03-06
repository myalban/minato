const COINBASE_AMOUNT = 50;

const getTransactionId = async (transaction) => {
    const txInContent = transaction['txIns']
        .map((txIn) => txIn['txOutId'] + txIn['txOutIndex'])
        .reduce((a, b) => a + b, '');

    const txOutContent = transaction['txOuts']
        .map((txOut) => txOut['address'] + txOut['amount'])
        .reduce((a, b) => a + b, '');

    return await sha256(txInContent + txOutContent);
}

const getTxInAmount = (txIn, aUnspentTxOuts) => {
    return findUnspentTxOut(txIn['txOutId'], txIn['txOutIndex'], aUnspentTxOuts)['amount'];
}

const findUnspentTxOut = (transactionId, index, aUnspentTxOuts) => {
    return aUnspentTxOuts.find((uTxO) => uTxO['txOutId'] === transactionId && uTxO['txOutIndex'] === index);
}

const isValidAddress = (address) => {
    if (address.length !== 86) {
        console.log('invalid public key length');
        return false;
    }

    return true;
}

const isValidTxOutStructure = (txOut) => {
    if (txOut == null) {
        return false;
    }

    if (typeof txOut['address'] !== 'string') {
        return false;
    }

    if (!isValidAddress(txOut['address'])) {
        return false;
    } 
    
    if (typeof txOut['amount'] !== 'number') {
        return false;
    }

    return true;
}

const isValidTxInStructure = (txIn) => {
    if (txIn == null) {
        return false;
    }

    if (typeof txIn['signature'] !== 'string') {
        return false;
    }

    if (typeof txIn['txOutId'] !== 'string') {
        return false;
    }

    if (typeof txIn['txOutIndex'] !== 'number') {
        return false;
    }

    return true;
}

const validateTxIn = async (txIn, transaction, aUnspentTxOuts) => {
    const referencedUTxOut =
        aUnspentTxOuts.find((uTxO) => uTxO['txOutId'] === txIn['txOutId'] && uTxO['txOutIndex'] === txIn['txOutIndex']);
    if (referencedUTxOut == null) {
        console.log('referenced txOut not found: ' + JSON.stringify(txIn));
        return false;
    }

    const address = referencedUTxOut['address'];
    const publicKey = await Elliptic.importPublicKey(address);
    const validSignature = await Elliptic.verify(publicKey, txIn['signature'], transaction['id']);
    if (!validSignature) {
        console.log('invalid txIn signature: %s txId: %s address: %s',
            txIn['signature'], transaction['id'], referencedUTxOut['address']);
        return false;
    }

    return true;
}

const isValidTransactionStructure = (transaction) => {
    if (typeof transaction['id'] !== 'string') {
        return false;
    }

    if (!(transaction['txIns'] instanceof Array)) {
        return false;
    }

    if (!transaction['txIns']
        .map(isValidTxInStructure)
        .reduce((a, b) => (a && b), true)) {
        return false;
    }

    if (!(transaction['txOuts'] instanceof Array)) {
        return false;
    }

    if (!transaction['txOuts']
        .map(isValidTxOutStructure)
        .reduce((a, b) => (a && b), true)) {
        return false;
    }

    return true;
}

const validateTransaction = async (transaction, aUnspentTxOuts) => {
    if (!isValidTransactionStructure(transaction)) {
        return false;
    }

    if (await getTransactionId(transaction) !== transaction['id']) {
        return false;
    }

    const tmp = await Promise.all(transaction['txIns'].map(
        async (txIn) => await validateTxIn(txIn, transaction, aUnspentTxOuts)
    ));
    const hasValidTxIns = tmp.reduce((a, b) => a && b, true);

    if (!hasValidTxIns) {
        console.log('some of the txIns are invalid in tx: ' + transaction['id']);
        return false;
    }

    const totalTxInValues = transaction['txIns']
        .map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
        .reduce((a, b) => (a + b), 0);

    const totalTxOutValues = transaction['txOuts']
        .map((txOut) => txOut.amount)
        .reduce((a, b) => (a + b), 0);

    if (totalTxOutValues !== totalTxInValues) {
        console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction['id']);
        return false;
    }

    return true;
}

const validateCoinbaseTx = async (transaction, blockIndex) => {
    if (transaction == null) {
        return false;
    }

    if (await getTransactionId(transaction) !== transaction['id']) {
        return false;
    }

    if (transaction['txIns'].length !== 1) {
        return;
    }

    if (transaction['txIns'][0].txOutIndex !== blockIndex) {
        return false;
    }

    if (transaction['txOuts'].length !== 1) {
        return false;
    }

    if (transaction['txOuts'][0].amount !== COINBASE_AMOUNT) {
        return false;
    }

    return true;
}

const hasDuplicates = (txIns) => {
    //const groups = txIns.countBy((txIn: TxIn) => txIn.txOutId + txIn.txOutIndex);
    const groups = txIns.reduce((a, b) => {
        let key = b['txOutId'] + b['txOutIndex'];
        a[key] = a[key] ? a[key] += 1 : 1;
        return a;
    }, {});

    for (let key in groups) {
        if (groups[key] > 1) {
            console.log('duplicate txIn: ' + key);
            return true;
        }
    }

    return false;
}

const validateBlockTransactions = async (aTransactions, aUnspentTxOuts, blockIndex) => {
    const coinbaseTx = aTransactions[0];
    if (!(await validateCoinbaseTx(coinbaseTx, blockIndex))) {
        console.log('invalid coinbase transaction: ' + JSON.stringify(coinbaseTx));
        return false;
    }

    // check for duplicate txIns. Each txIn can be included only once
    const txIns = aTransactions
        .map((tx) => tx['txIns'])
        .reduce((a, b) => a.concat(b), []);

    if (hasDuplicates(txIns)) {
        return false;
    }

    // all but coinbase transactions
    const normalTransactions = aTransactions.slice(1);
    const tmp = await Promise.all(normalTransactions.map(
        async (tx) => await validateTransaction(tx, aUnspentTxOuts)
    ));
    return tmp.reduce((a, b) => (a && b), true);
};

/**
 *  Thưởng 50 Coinbase cho giao dịch
 */
const getCoinbaseTransaction = async (address, blockIndex) => {
    const txIn = {
        'signature': '',
        'txOutId': '',
        'txOutIndex': blockIndex
    };

    const t = {
        'id': '',
        'txIns': [txIn],
        'txOuts': [{
            'address': address,
            'amount': COINBASE_AMOUNT
        }]
    };

    t['id'] = await getTransactionId(t);
    return t;
};

const signTxIn = async (transaction, txInIndex, privateKey, aUnspentTxOuts) => {
    const txIn = transaction['txIns'][txInIndex];

    const dataToSign = transaction['id'];
    const referencedUnspentTxOut = findUnspentTxOut(txIn['txOutId'], txIn['txOutIndex'], aUnspentTxOuts);
    if (referencedUnspentTxOut == null) {
        console.log('could not find referenced txOut');
        throw Error();
    }
    const referencedAddress = referencedUnspentTxOut['address'];

    if (Wallet.getPublicFromWallet() !== referencedAddress) {
        console.log('trying to sign an input with private' +
            ' key that does not match the address that is referenced in txIn');
        throw Error();
    }

    const signature = await Elliptic.sign(privateKey, dataToSign);
    return signature;
};

const updateUnspentTxOuts = (aTransactions, aUnspentTxOuts) => {
    const newUnspentTxOuts = aTransactions
        .map((t) => {
            return t['txOuts'].map((txOut, index) => {
                return {
                    'txOutId': t.id,
                    'txOutIndex': index,
                    'address': txOut['address'],
                    'amount': txOut['amount']
                };
            });
        })
        .reduce((a, b) => a.concat(b), []);

    const consumedTxOuts = aTransactions
        .map((t) => t['txIns'])
        .reduce((a, b) => a.concat(b), [])
        .map((txIn) => {
            return {
                'txOutId': txIn['txOutId'],
                'txOutIndex': txIn['txOutIndex'],
                'address': '',
                'amount': 0
            };
        });

    const resultingUnspentTxOuts = aUnspentTxOuts
        .filter(((uTxO) => !findUnspentTxOut(uTxO['txOutId'], uTxO['txOutIndex'], consumedTxOuts)))
        .concat(newUnspentTxOuts);

    return resultingUnspentTxOuts;
}

const processTransactions = async (aTransactions, aUnspentTxOuts, blockIndex) => {
    if (!(await validateBlockTransactions(aTransactions, aUnspentTxOuts, blockIndex))) {
        console.log('invalid block transactions');
        return null;
    }

    return updateUnspentTxOuts(aTransactions, aUnspentTxOuts);
}
