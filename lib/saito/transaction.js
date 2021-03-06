const saito         = require('../saito');

function Transaction(txjson="") {

  if (!(this instanceof Transaction)) {
    return new Transaction(txjson);
  }

  /////////////////////////
  // consensus variables //
  /////////////////////////
  this.transaction               = {};
  this.transaction.id            = 1;
  this.transaction.from          = [];
  this.transaction.to            = [];
  this.transaction.ts            = "";
  this.transaction.sig           = ""; 
  this.transaction.ver           = 1.0;
  this.transaction.path          = [];
  this.transaction.gt            = null;
  this.transaction.ft            = null;
  this.transaction.msg           = {};
  this.transaction.msig          = "";
  this.transaction.ps            = 0;
  this.transaction.rb            = 0;  // 0  = do not rebroadcast
				       // 1+ = num of current broadcast
				       // -1 = rebroadcast as VIP token
				       // -2 = rebroadcast as GoldenChunk

  ///////////////////
  // non-consensus //
  ///////////////////
  this.size			 = 0;  // size in bytes
  this.dmsg             	 = ""; // decrypted msg
  this.ufee                      = -1; // usable fee
  this.fee                       = -1; // total fee
  this.is_valid			 = 1;  // is valid tx


  /////////////////
  // import json //
  /////////////////
  if (txjson != "") {
    try {
      this.transaction = JSON.parse(txjson.toString("utf8"));
      if (this.transaction.from == null) { this.transaction.from = []; }
      if (this.transaction.to == null)   { this.transaction.to = []; }
      for (var txi = 0; txi < this.transaction.from.length; txi++) {
        this.transaction.from[txi] = new saito.slip(this.transaction.from[txi].add, this.transaction.from[txi].amt, this.transaction.from[txi].gt, this.transaction.from[txi].bid, this.transaction.from[txi].tid, this.transaction.from[txi].sid, this.transaction.from[txi].bhash, this.transaction.from[txi].lc, this.transaction.from[txi].ft, this.transaction.from[txi].rn);
      }
      for (var txi = 0; txi < this.transaction.to.length; txi++) {
        this.transaction.to[txi] = new saito.slip(this.transaction.to[txi].add, this.transaction.to[txi].amt, this.transaction.to[txi].gt, this.transaction.to[txi].bid, this.transaction.to[txi].tid, this.transaction.to[txi].sid, this.transaction.to[txi].bhash, this.transaction.to[txi].lc, this.transaction.to[txi].ft, this.transaction.to[txi].rn);
      }
    } catch (err) {
      this.is_valid = 0;
    }
  }

  return this;

}
module.exports = Transaction;



Transaction.prototype.addFrom = function addFrom(fromAddress, fromAmount) {
  this.from.push(new saito.slip(fromAddress, fromAmount));
}
Transaction.prototype.addTo = function addTo(toAddress, toAmount) {
  this.to.push(new saito.slip(toAddress, toAmount));
}
Transaction.prototype.decryptMessage = function decryptMessage(app) {
  // try-catch avoids errors decrypting non-encrypted content
  try {
    var x = app.keys.decryptMessage(this.transaction.from[0].add, this.transaction.msg);
    this.dmsg = x;
  } catch (e) {}
  return;
}
// accepts the old tx and creates one that will validate
Transaction.prototype.generateRebroadcastTransaction = function generateRebroadcastTransaction(slip_id, avg_fee=2) {

  if (this.transaction.to.length == 0) { 
    console.log("THERE ARE NO TO ADDRESSES IN THIS TX");
    return null; 
  }

  var newtx = new saito.transaction();
  newtx.transaction.sig = this.transaction.sig;
  newtx.transaction.msg = {};

  var fee = avg_fee;

  if (this.transaction.rb >= 0) {
    newtx.transaction.rb = this.transaction.rb+1;
    for (i = 1; i < newtx.transaction.rb; i++) {
      fee = fee*2;
    }
  }
  if (this.transaction.rb == -1) {
    // secure tokens for early supporters
    newtx.transaction.rb = this.transaction.rb;
    fee = 0;
  }

  //
  // 2 SAITO PER BLOCK
  //
  if (this.transaction.rb == -2) {
    newtx.transaction.rb = this.transaction.rb;
    fee = 2;
  }

  var amt = this.transaction.to[slip_id].amt - fee;

  //
  // TODO
  // 
console.log("AMOUNT: " + amt);

  if (amt < 0) { return null; }



  if (this.transaction.msg.tx != undefined) {
    newtx.transaction.msg.tx = this.transaction.msg.tx;
  } else {
    newtx.transaction.msg.tx = JSON.stringify(this.transaction);
  }

  // create TO and FROM slips
  var from = new saito.slip(this.transaction.to[slip_id].add, this.transaction.to[slip_id].amt);
  var to   = new saito.slip(this.transaction.to[slip_id].add, amt);
  var fee  = new saito.slip("00000000000000000000000000000000000000000000", fee);

  newtx.transaction.from.push(from);
  newtx.transaction.to.push(to);
  newtx.transaction.to.push(fee);   // this ensures fee falls into money supply

console.log(JSON.stringify(newtx));

  return newtx;

}
Transaction.prototype.involvesPublicKey = function involvesPublicKey(publickey) {
  if (this.returnSlipsFrom(publickey).length > 0 || this.returnSlipsTo(publickey).length > 0 ) { return 1; }
  return 0;
}
Transaction.prototype.isGoldenTicket = function isGoldenTicket() {
  if (this.transaction.gt != null) { return 1; }
  return 0;
}
Transaction.prototype.isFeeTransaction = function isFeeTransaction() {
  if (this.transaction.ft != 1) { return 0; }
  return 1;
}
Transaction.prototype.isFrom = function isFrom(senderPublicKey) {
  if (this.returnSlipsFrom(senderPublicKey).length != 0) { return 1; }
  return 0;
}
Transaction.prototype.isTo = function isTo(receiverPublicKey) {
  if (this.returnSlipsTo(receiverPublicKey).length != 0) { return 1; }
  return 0;
}
Transaction.prototype.isAutomaticallyRebroadcast = function isAutomaticallyRebroadcast(deadblk, newblk) {
  if (this.transaction.to.length == 0) { return 0; }
  if (this.transaction.rb < 0)         { return 1; }
  if (this.transaction.to[0].amt > 10) { return 1; }
  return 0;
}
Transaction.prototype.returnAmountTo = function returnAmountTo(toAddress) {
  var x = 0.0;
  if (this.transaction.to != null) {
    for (var v = 0; v < this.transaction.to.length; v++) {
      if (this.transaction.to[v].add == toAddress) {
        if (this.transaction.to[v].amt > 0) { x = parseFloat(x) + parseFloat(this.transaction.to[v].amt); }
      }
    }
  }
  return x;
}
Transaction.prototype.returnFeeUsable = function returnFeeUsable() {

  if (this.ufee == -1 || this.ufee == null) {

    var inputs = 0.0;
    if (this.transaction.from != null) {
      for (var v = 0; v < this.transaction.from.length; v++) {
        inputs = parseFloat(inputs) + parseFloat(this.transaction.from[v].amt);
      }
    }

    var outputs = 0.0;
    for (var v = 0; v < this.transaction.to.length; v++) {
      // only count outputs on non-gt transactions
      if (this.transaction.to[v].gt != 1) {
        outputs = parseFloat(outputs) + parseFloat(this.transaction.to[v].amt);
      }
    }

    this.fee = (inputs - outputs);
    this.ufee = this.fee;

    var pathlength = this.returnPathLength();

    for (var x = 1; x < pathlength; x++) {
      this.ufee = this.fee/2;
      this.ufee.toFixed(8);
    }

    return this.ufee;
  } else {
    return this.ufee;
  }
}
Transaction.prototype.returnFeeTotal = function returnFeeTotal() {

  if (this.fee == -1 || this.fee == null) {

    var inputs = 0.0;
    for (var v = 0; v < this.transaction.from.length; v++) {
      inputs = parseFloat(inputs) + parseFloat(this.transaction.from[v].amt);
    }

    var outputs = 0.0;
    for (var v = 0; v < this.transaction.to.length; v++) {
      // only count outputs on non-gt transactions
      if (this.transaction.to[v].gt != 1) {
        outputs = parseFloat(outputs) + parseFloat(this.transaction.to[v].amt);
      }
    }

    this.fee = (inputs - outputs);
  }

  return this.fee;
}
Transaction.prototype.returnId = function returnId() {
  return this.transaction.id;
}
Transaction.prototype.returnMessage = function returnMessage() {
  if (this.dmsg != "") { return this.dmsg; }
  return this.transaction.msg;
}
Transaction.prototype.returnMessageSignatureSource = function returnMessageSignatureSource() {
  return JSON.stringify(this.transaction.msg);
}
Transaction.prototype.returnSignatureSource = function returnSignatureSource() {
  return JSON.stringify(this.transaction.from) + 
         JSON.stringify(this.transaction.to) + 
         this.transaction.ts +
         this.transaction.ps +
         this.transaction.rb +
         JSON.stringify(this.transaction.gt) +
         JSON.stringify(this.transaction.ft) +
         JSON.stringify(this.transaction.msig);
}
Transaction.prototype.returnSlipsTo = function returnSlipsTo(toAddress) {
  var x = [];
  if (this.transaction.to != null) {
    for (var v = 0; v < this.transaction.to.length; v++) {
      if (this.transaction.to[v].add == toAddress) { x.push(this.transaction.to[v]); }
    }
  }
  return x;
}
Transaction.prototype.returnSlipsFrom = function returnSlipsFrom(fromAddress) {
  var x = [];
  if (this.transaction.from != null) {
    for (var v = 0; v < this.transaction.from.length; v++) {
      if (this.transaction.from[v].add == fromAddress) { x.push(this.transaction.from[v]); }
    }
  }
  return x;
}
Transaction.prototype.returnTransactionJson = function returnTransactionJson() {
  return JSON.stringify(this.returnTransaction());
}
Transaction.prototype.returnTransaction = function returnTransaction() {
  return this.transaction;
}
Transaction.prototype.returnPathLength = function returnPathLength() {
  return this.transaction.path.length;
}
Transaction.prototype.returnSender = function returnSender() {
  if (this.transaction.from.length >= 1) {
    return this.transaction.from[0].add;
  }
}
Transaction.prototype.signMessage = function signMessage(message) {
  return saito.crypt().signMessage(message, this.app.wallet.returnPrivateKey());
}
Transaction.prototype.signTransaction = function signTransaction() {
  this.transaction.msig   = this.signMessage(this.transaction.msg);
  this.transaction.sig  = this.signMessage(this.returnSignatureSource());
}
Transaction.prototype.validate = function validate(app, paysplit_vote=0, block_id=0) {

  ////////////////////
  // validate votes //
  ////////////////////
  if (paysplit_vote == 1) {
    if (this.transaction.ps != 1 && this.transaction.gt != null) {
      console.log("transaction paysplit vote differs from block paysplit vote");
      app.mempool.removeTransaction(this);
      return 0;
    }
  }
  if (paysplit_vote == -1) {
    if (this.transaction.ps != -1 && this.transaction.gt != null) {
      console.log("transaction paysplit vote differs from block paysplit vote");
      app.mempool.removeTransaction(this);
      return 0;
    }
  }


  ///////////////////////////
  // within genesis period //
  ///////////////////////////
  var acceptable_lower_block_limit = block_id-app.blockchain.returnGenesisPeriod();
  for (var tidx = 0; tidx < this.transaction.from.length; tidx++) {
    if (this.transaction.from[tidx].bid < acceptable_lower_block_limit && this.transaction.ft != 1 && this.transaction.from[tidx].gt != 1) {
      console.log("transaction outdated: tries to spend input from block "+this.transaction.from[tidx].bid);
      console.log(this.transaction.from[tidx]); 
      app.mempool.removeTransaction(this);
      return 0;
    }
  }


  /////////////////////////////////
  // min one sender and receiver //
  /////////////////////////////////
  if (this.transaction.from.length < 1) { 
    console.log("no from address in transaction");
    app.mempool.removeTransaction(this);
    return 0;
  }
  if (this.transaction.to.length < 1) { 
    console.log("no to address in transaction");
    app.mempool.removeTransaction(this);
    return 0;
  }



if (this.transaction.msg == "golden ticket") {
  console.log("SIGSRC: " + this.returnSignatureSource());
}



  ///////////////////////////
  // validate tx signature //
  ///////////////////////////
  if (!saito.crypt().verifyMessage(this.returnSignatureSource(),this.transaction.sig,this.returnSender())) {

    // maybe this is a rebroadcast tx
    if (this.transaction.rb == 1) {

      var oldtx = new saito.transaction(this.transaction.msg.tx);

      // restore to original signed condition
      for (let i = 0; i < oldtx.transaction.to.length; i++) {
        oldtx.transaction.to[i].bid = 0;
        oldtx.transaction.to[i].tid = 0;
        oldtx.transaction.to[i].sid = i;
        oldtx.transaction.to[i].bhash = "";
      }

      if (!saito.crypt().verifyMessage(oldtx.returnSignatureSource(), oldtx.transaction.sig, oldtx.returnSender())) {
        console.log("transaction signature in original rebroadcast tx does not verify");
        app.mempool.removeTransaction(this);
        return 0;
      }

    } else {
      console.log("transaction signature does not verify");
      app.mempool.removeTransaction(this);
      return 0;
    }

  }

  ////////////////////////////
  // validate msg signature //
  ////////////////////////////
  if (!saito.crypt().verifyMessage(this.returnMessageSignatureSource(),this.transaction.msig,this.returnSender())) {

    // maybe this is a rebroadcast tx
    if (this.transaction.rb == 1) {

      var oldtx = new saito.transaction(this.transaction.msg.tx);

      // restore to original signed condition
      for (let i = 0; i < oldtx.transaction.to.length; i++) {
        oldtx.transaction.to[i].bid = 0;
        oldtx.transaction.to[i].tid = 0;
        oldtx.transaction.to[i].sid = i;
        oldtx.transaction.to[i].bhash = "";
      }

      if (!saito.crypt().verifyMessage(oldtx.returnMessageSignatureSource(), oldtx.transaction.msig, oldtx.returnSender())) {
        console.log("transaction message signature does not verify");
        app.mempool.removeTransaction(this);
        return 0;
      }

    } else {
      console.log("transaction message signature does not verify");
      app.mempool.removeTransaction(this);
      return 0;
    }
  }

  return 1;

}

