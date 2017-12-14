var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');

var http = require('http');
var https = require('https');

var iconv = require('iconv-lite');

var inQuiz = false;
var quizCategory = "";
var players;
var quizQuestions;
var questionIndex;
var currentAlternatives;

// Options used when getting Chuck Norris jokes
var chuckJokeOptions = {
  host: 'api.icndb.com',
  path: '/jokes/random'
};

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

// Simple decodeHTML function to decode some HTML which gets sent from quiz-database
String.prototype.decodeHTML = function() {
    var map = {"gt":">", "#039;":"''", "quot":"\"" /* , … */};
    return this.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);?/gi, function($0, $1) {
        if ($1[0] === "#") {
            return String.fromCharCode($1[1].toLowerCase() === "x" ? parseInt($1.substr(2), 16)  : parseInt($1.substr(1), 10));
        } else {
            return map.hasOwnProperty($1) ? map[$1] : $0;
        }
    });
};

// Handles messages in the channel
bot.on('message', function (user, userID, channelID, message, evt) {

    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];

        args = args.splice(1);
        switch(cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: 'Pong!'
                });
            break;
            case 'chuck':
              // Get a Chuck Norris joke and send it to the channel
              http.get(chuckJokeOptions, function(resp){
                resp.on('data', function(chunk){
                  bot.sendMessage({
                    to: channelID,
                    message: JSON.parse(chunk.toString()).value.joke
                  });
                });
              }).on("error", function(e){
                console.log("Got error: " + e.message);
              });
              break;
            case "quiz":
              // If we are not already in a quiz, start one
              if (!inQuiz) {
                inQuiz = true;
                quizCategory = args[1];
                players = new Map();
                questionIndex = 0;

                https.get("https://opentdb.com/api.php?amount=10", function(resp){
                  resp.on('data', function(chunk){
                    quizQuestions = JSON.parse(iconv.decode(chunk, 'windows-1252')).results;
                    AskQuestion(channelID)
                  });
                }).on("error", function(e){
                  console.log("Got error: " + e.message);
                });
            }
        }

   if (inQuiz){
     // We are in a quiz
     if (message == "!stopQuiz") {
       bot.sendMessage({
         to: channelID,
         message: "The quiz is over :("
       });
       inQuiz = false;
     }

     if (message == "!n") {
       bot.sendMessage({
         to: channelID,
         message: "The round is over, the correct answer was: " + quizQuestions[questionIndex].correct_answer
       });
       setTimeout(CalculateScores, 1000, channelID);
       setTimeout(PrintScores, 2000, channelID);
       setTimeout(NextRound, 3000, channelID);
     } else {
       if (players in user) {
         players.get(user).currentGuess = message;
       } else {
         players.set(user, {score: 0, currentGuess: message});
       }
     }
   }
 }
});

PrintScores = (channelID) => {
  resultString = "The total score: \n";
  players.forEach(function(item, key, mapObj){
    if (key != "Geoff"){
      resultString += key + " : " + item.score;
      resultString += "\n";
    };
});

bot.sendMessage({
  to: channelID,
  message: resultString
});
}

CalculateScores = (channelID) => {
  var resultString = "";
    players.forEach(function(item, key, mapObj){
      if (key != "Test-bot"){
        if (currentAlternatives.get(item.currentGuess) == quizQuestions[questionIndex].correct_answer) {
          resultString += key + " got it right! (+ 1 score)";
          item.score++;
        } else {
          resultString += key + " was not clever enough :(";
        }
        resultString += "\n";
    };
  });
  bot.sendMessage({
    to: channelID,
    message: resultString
  });
}

AskQuestion = (channelID) => {
  bot.sendMessage({
    to: channelID,
    message: (quizQuestions[questionIndex].question.decodeHTML())
  });
  setTimeout(SendAlternatives, 1500, channelID);
}

SendAlternatives = (channelID) => {
  var alternatives = shuffle(quizQuestions[questionIndex].incorrect_answers.concat(quizQuestions[questionIndex].correct_answer));
  currentAlternatives = new Map();
  var alphabet = ["A","B","C","D","E","F","G","H"];

  var alternativesString = "";

  for (var i = 0; i < alternatives.length; i++) {
    currentAlternatives.set(alphabet[i], alternatives[i]);
    alternativesString += " " + alphabet[i] + ": " + (alternatives[i]);
  }
  bot.sendMessage({
    to: channelID,
    message: "Alternatives: " +  alternativesString
  });
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

NextRound = (channelID) => {

  questionIndex++;
  if (questionIndex < quizQuestions.length) {
    bot.sendMessage({
      to: channelID,
      message: "Ladies and gentlemen, gather round, the next round is about to start!"
    });
    setTimeout(AskQuestion, 1000, channelID);
  } else {
    bot.sendMessage({
      to: channelID,
      message: "Thats all, lets see who won!"
    });
    PrintScores(channelID);
    inQuiz = false;
  }
}
