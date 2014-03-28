var USER_ID = 5; // = howardlindzon
                 //   used for Stocks I follow
                 //   and for Users I follow

var ES_ENDPOINT = '23.253.39.42:9200',
    ES_URL = 'http://' + ES_ENDPOINT,
    ES_CLIENT = elasticsearch.Client({
      host: ES_ENDPOINT
});


var Autocomplete = new Bloodhound({
    datumTokenizer: function (d) {
        return Bloodhound.tokenizers.whitespace(d.value);
    },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    remote: {
        url: ES_URL + '/autocomplete-test/_suggest?source={"suggest":{"text":"%QUERY","completion":{"field":"suggest","size":10}}}',
        filter: function(Response) {
           var dataSet = [];
           var parsedResponse = Response.suggest[0].options;

           for(var i = 0; i < parsedResponse.length; i++) {
              var src = parsedResponse[i].payload;

               var datum = {};

               datum.id = src.id
               if(src.symbol){
                 datum.symbol = true;
                 datum.label = src.symbol;
                 datum.value = "$" + datum.label;
                 datum.title = src.title;
                 datum.exchange = src.exchange;
               }
               else if(src.user){
                 datum.user = true;
                 datum.label = src.username;
                 datum.value = "@" + datum.label;
                 datum.exchange = src.exchange;
                 datum.name = src.name;
               }
              console.log(datum);
              dataSet.push(datum);
           }

           return dataSet;
         }
    }
});


// instantiate the symbol suggestion engine
var symbolAutocomplete = new Bloodhound({
    datumTokenizer: function (d) {
        return Bloodhound.tokenizers.whitespace(d.value);
    },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    remote: {
        url: ES_URL + '/symbols/_search?q=symbol:%QUERY* title:%QUERY*',
        filter: function(Response) {
           var dataSet = [];
           var parsedResponse = Response.hits.hits;

           for(var i = 0; i < parsedResponse.length; i++) {
              var receivedData = parsedResponse[i];
              var src = receivedData['_source'];
              src.id = receivedData['_id'];

              var datum = {};

              datum.label = src.symbol;
              datum.value = "$" + datum.label;
              datum.id = src.id;
              datum.title = src.title;
              datum.exchange = src.exchange;
              dataSet.push(datum);
           }
           return dataSet;
         }
    }
});

// instantiate the user suggestion engine
var userAutocomplete = new Bloodhound({
    datumTokenizer: function (d) {
        return Bloodhound.tokenizers.whitespace(d.value);
    },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    remote: {
        url: ES_URL + '/users/user-type/_search?q=username:%QUERY*',
        filter: function(Response) {
           var dataSet = [];
           var parsedResponse = Response.hits.hits;

           for(var i = 0; i < parsedResponse.length; i++) {
              var receivedData = parsedResponse[i];
              var src = receivedData['_source'];
              src.id = receivedData['_id'];

              var datum = {};

              datum.label = src.username;
              datum.value = "@" + datum.label;
              datum.id = src.id;
              datum.avatar = src.avatar_url;
              datum.name = src.name || "";
              dataSet.push(datum);
           }
           return dataSet;
         }
    }
});

// initialize the bloodhound suggestion engine
symbolAutocomplete.initialize();
userAutocomplete.initialize();
Autocomplete.initialize();

function AdvancedSearch(){
  var ok = this;

  ok.$q           = $('#search');
  ok.$results     = $('.searchResults');
  ok.$hiddenForm  = $('#sssearch');

  ok.reg = {
    atTag       :   /@/ig,
    atTagWord   :   /@(\w+)/ig,
    cashTag     :   /[$]/ig,
    cashTagWord : /[$](\w+)/ig
  };

  ok.hashbang = '!/';

  ok.getIncludes = function(list){
    var _results = []
    for(var i=0; i < list.length; i++){
      _results.push(list[i].title.toLowerCase());
    }
    return {
      include: _results
    }
  }

  ok.generateQuery = function(queryInput) {
    var usernames = ok.getIncludes(ok.users() || ""),
        symbols = ok.getIncludes(ok.symbols() || ""),
        terms = ok.getIncludes(ok.terms() || ""),
        phrases = ok.getIncludes(ok.phrases() || ""),
        filters = (_.isArray(ok.filters())) ? ok.filters() : [];

    var es = { filter: { bool: { must: [], must_not: [] } }};

    if (usernames.include.length > 0) {
      es.filter.bool.must.push({ terms: { "user.username": usernames.include }});
    }

    // if (username.exclude.length > 0) {
    //   es.filter.bool.must_not.push({ terms: { "user.username": username.exclude }});
    // }

    if (symbols.include.length > 0) {
      es.filter.bool.must.push({ terms: { "symbols.symbol": symbols.include }});
    }

    // if (symbols.exclude.length > 0) {
    //   es.filter.bool.must_not.push({ terms: { "symbols.symbol": symbols.exclude }});
    // }

    if (terms.include.length > 0 || phrases.include.length > 0) {
      es.filter.bool.must.push({ query: { query_string: { query: terms.include.concat(phrases.include).join(" OR "), default_field: "body" }}});
    }

    // if (phrases.exclude.length > 0 || searches.exclude.length > 0) {
    //   es.filter.bool.must_not.push({ query: { query_string: { query: (phrases.exclude.concat(searches.exclude)).join(' OR '), default_field: "body" }}});
    // }
    if (_.contains(filters, 'sentiment')) {
      es.filter.bool.must.push({ exists: { field: "entities.sentiment" }});
    }

    if (_.contains(filters, 'charts')) {
      es.filter.bool.must.push({ exists: { field: "entities.chart" }});
    }

    if (_.contains(filters, 'no_replies')) {
      es.filter.bool.must.push({ query: { query_string: { query: "_missing_: conversation OR conversation.parent:true" }}});
    }

    if (_.isNumber(USER_ID)) {
      if (_.contains(filters, 'stockships') && symbols.include.length === 0) {
        es.filter.bool.must.push({ terms: { "symbols.id": { "index": "stockships", "type": "stockship", "id": USER_ID, "path": "following.id" }}});
      }

      if (_.contains(filters, 'friendships') && usernames.include.length === 0) {
        es.filter.bool.must.push({ terms: { "user.id": { "index": "friendships", "type": "friendship", "id": USER_ID, "path": "following.id" }}});
      }
    }

    return es;
  }


  ok.search = ko.observable("");
  ok.query = ko.observable("");


  ok.checkURL = function(){
    var newQuery = decodeURIComponent(parent.location.hash).slice(1);
    ok.search(newQuery);
    ok.query(newQuery);
    $("html, body").animate({ scrollTop: 0 });
  }

  ok.symbols = ko.computed(function(){
    var _results = [];
    var _tokens = ok.query().trim().replace(/,/g, '').split(" ");
    var _q = ok.search().trim().replace(/,/g, '').split(" ");

    for(var i=0; i<_tokens.length; i++){
      if(_tokens[i].charAt(0) == "$"){
        if(_q.indexOf(_tokens[i]) >= 0){
          _results.push({title: _tokens[i].slice(1), inInitialSearch: true});
        } else{
          _results.push({title: _tokens[i].slice(1), inInitialSearch: false});
        }
      }
    }
    return _results;

  }, ok);

  ok.users = ko.computed(function(){
    var _results = [];
    var _tokens = ok.query().trim().replace(/,/g, '').split(" ");
    var _q = ok.search().trim().replace(/,/g, '').split(" ");

    for(var i=0; i<_tokens.length; i++){
      if(_tokens[i].charAt(0) == "@"){
          if(_q.indexOf(_tokens[i]) >= 0){
            _results.push({title: _tokens[i].slice(1), inInitialSearch: true});
          } else{
            _results.push({title: _tokens[i].slice(1), inInitialSearch: false});
          }
      }
    }
    return _results;

  }, ok);

  ok.terms = ko.computed(function(){
    var _results = [];
    var _tokens = ok.query().trim();
    var _phrases = _tokens.match(/(?:"(?:[^"\\]+|\\(?:\\\\)*.)*"|'(?:[^'\\]+|\\(?:\\\\)*.)*')/g);
    if(_.isArray(_phrases)){
      for(var i=0; i<_phrases.length; i++){ _tokens = _tokens.replace(_phrases[i], '') }
    }
        _tokens = _tokens.replace(/,/g, '').split(" ");
        // _tokens = _tokens.clean("");
        // _tokens = _tokens.clean(" ");

    var _q = ok.search().trim().replace(/,/g, '').split(" ");

    for(var j=0; j<_tokens.length; j++){
      if(_tokens[j].charAt(0) != "$" && _tokens[j].charAt(0) != "@" && _tokens[j].length>0){
        if(_q.indexOf(_tokens[j]) >= 0){
          _results.push({title: _tokens[j], inInitialSearch: true});
        } else{
          _results.push({title: _tokens[j], inInitialSearch: false});
        }
      }
    }

    return _results;

  }, ok);

  ok.phrases = ko.computed(function(){
    var _results = [];
    var _phrases = ok.query().trim().match(/(?:"(?:[^"\\]+|\\(?:\\\\)*.)*"|'(?:[^'\\]+|\\(?:\\\\)*.)*')/g);
    var _q = ok.search().trim();
    if(_.isArray(_phrases)){
        for(var i=0; i<_phrases.length; i++){
              if(_q.indexOf(_phrases[i]) >= 0){
                _results.push({title: _phrases[i], inInitialSearch: true});
              } else {
                _results.push({title: _phrases[i], inInitialSearch: false});
              }

        }
    }

    return _results;
  });

  ok.queryIsEmpty = ko.computed(function(){
    return ok.query().length == 0;
  }, ok);

  ok.anySymbols = ko.computed(function(){
    return ok.symbols().length == 0;
  }, ok);

  ok.anySymbolsInInitialSearch = ko.computed(function(){
    var _q = ok.search().trim().replace(/,/g, '').split(" ");
    for(var i=0; i<_q.length; i++){
      if(_q[i].charAt(0) == "$"){
        return true;
      }
    }
    return false;
  });

  ok.anyUsersInInitialSearch = ko.computed(function(){
    var _q = ok.search().trim().replace(/,/g, '').split(" ");
    for(var i=0; i<_q.length; i++){
      if(_q[i].charAt(0) == "@"){
        return true;
      }
    }
    return false;
  });

  ok.anyUsers = ko.computed(function(){
    return ok.users().length == 0;
  }, ok);

  ok.anyTerms = ko.computed(function(){
    return ok.terms().length == 0;
  }, ok);

  ok.addSymbol = function(){
    var $s = $('#addSymbol').val().trim().toUpperCase();
    if($s.charAt(0) == "$") $s = $s.slice(1);
    if($s.length != 0){
      $s = ok.$q.val() + " $" + $s;
    }
    else{
      return false;
    }
    ok.updateQuery($s);
    $('#addSymbol').val("");
    ok.clearHints();
  }

  ok.removeSymbol = function(){
    var newQuery = ok.$q.val().replace("$" + this.title,"").trim();
    ok.updateQuery(newQuery);

  }

  ok.addUser = function(){
    var $s = $('#addUser').val().trim();
    if($s.charAt(0) == "@") $s = $s.slice(1);
    if($s.length != 0){ $s = ok.$q.val() + " @" + $s }
    else{ return false; }
    ok.updateQuery($s);
    $('#addUser').val("");
    ok.clearHints();
  }

  ok.removeUser = function(){
    var newQuery = ok.$q.val().replace("@" + this.title,"").trim();
    ok.updateQuery(newQuery);
  }

  ok.addTerm = function(){
    var $s = $('#addTerm').val().trim();
    if($s.charAt(0) == "@") $s = $s.slice(1);
    if($s.charAt(0) == "$") $s = $s.slice(1);
    if($s.charAt(0) == "#") $s = $s.slice(1);
    if($s.charAt(0) == '"') $s = $s.slice(1);
    if($s.charAt(0) == '"') $s = $s.substring(0, $s.length - 1);
    if($s.indexOf(" ") > 0) $s = '"' + $s + '"';

    if($s.length != 0){
      $s = ok.$q.val() + " " + $s;
    }
    else{
      return false;
    }
    ok.updateQuery($s);
    $('#addTerm').val("");
    ok.clearHints();
  }

  ok.removeTerm = function(){
    var newQuery = ok.$q.val().replace(this.title,"").trim();
    ok.updateQuery(newQuery);
  }

  ok.removePhrase = function(){
    var newQuery = ok.$q.val().replace('"' + this.title + '"', '').trim();
    ok.updateQuery(newQuery);
  }

  ok.clearHints = function(){
    $('input.tt-hint').val("");
  }

  ok.updateQuery = function(new_value){
    new_value = new_value.replace(/ +(?= )/g,''); //remove double spaces
    ok.$q.val(new_value);
    ok.query(new_value);
    // ok.$q.tokenfield('setTokens', ok.$q.val());
  }

  ok.contentChoices = ['All', 'Sentiment', 'Charts', 'Excluding replies'];
  ok.symbolChoices = ['All stocks', 'Stocks I follow', 'Search stocks'];
  ok.userChoices = ['All users', 'Users I follow', 'Search users'];
  ok.chosenContent = ko.observable();
  ok.chosenSymbol = ko.observable('All stocks');
  ok.chosenUser = ko.observable('All users');

  ok.goToContentChoice = function(choice) { ok.chosenContent(choice); };
  ok.goToSymbolChoice = function(choice) { ok.chosenSymbol(choice); };
  ok.goToUserChoice = function(choice) { ok.chosenUser(choice); };

  ok.removeSymbols = function(){
    var _query = ok.$q.val();
    var _symbols = _query.match(ok.reg.cashTagWord);
    for(var i=0; i<_symbols.length; i++){
      _query = _query.replace(_symbols[i], "");
    }
    ok.updateQuery(_query);
  }

  ok.useAnyStocks = ko.computed(function(){
    return (ok.chosenSymbol() == 'All stocks');
  });

  ok.useAnyStocks.subscribe(function(truth){
    if(truth && ok.symbols().length > 0){
      ok.removeSymbols();
    }
  });

  ok.useWatchlist = ko.computed(function(){
    return (ok.chosenSymbol() == 'Stocks I follow');
  });

  ok.useWatchlist.subscribe(function (truth){
    if(truth && ok.symbols().length > 0){
      ok.removeSymbols();
    }
  });

  ok.removeUsers = function(){
    var _query = ok.$q.val();
    var _users = _query.match(ok.reg.atTagWord);
    for(var i=0; i<_users.length; i++){
      _query = _query.replace(_users[i], "");
    }
    ok.updateQuery(_query);
  }

  ok.useAnyUsers = ko.computed(function(){
    return (ok.chosenUser() == 'All users');
  });

  ok.useAnyUsers.subscribe(function(truth){
    if(truth && ok.users().length > 0){
      ok.removeUsers();
    }
  });

  ok.useFollowing = ko.computed(function(){
    return (ok.chosenUser() == 'Users I follow');
  });

  ok.useFollowing.subscribe(function (truth){
    if(truth && ok.users().length > 0){
      ok.removeUsers();
    }
  });

  ok.filters = ko.computed(function(){
    var _filters = [];

    if(ok.useWatchlist()) _filters.push('stockships');
    if(ok.useFollowing()) _filters.push('friendships');
    switch(ok.chosenContent())
    {
    case 'All':
      return _filters;
      break;
    case 'Sentiment':
      _filters.push('sentiment');
      break;
    case 'Charts':
      _filters.push('charts');
      break;
    case 'Excluding replies':
      _filters.push('no_replies');
      break;
    default:
      return _filters;
    }

    return _filters;
  });

  ok.newSearch = function(){
    setTimeout(function(){

      var esBody = _.extend(ok.generateQuery(), { sort: [{ id: { order: 'desc' }}], size: 100 });
      $('pre#query').html(JSON.stringify(esBody, null, 1));
      if( ok.queryIsEmpty() ) return;
      $('.searchResults').html(ok.loadingTemplate);
      parent.location.hash = encodeURIComponent(ok.query());
      console.time("ES");
      ES_CLIENT.search({
        index: 'messages',
        body: esBody
      }).then(function(resp) {
        console.timeEnd("ES");
        //res.render('index', { title: 'StockTwits', query: req.query, matches: resp.hits.hits, took: resp.took });
        ok.render({ matches: resp.hits.hits, took: resp.took });
      }, function(err) {
        console.trace(err.message);
      });

    }, 250);
  }

  ok.query.subscribe(function(){
    ok.newSearch();
  });

  ok.filters.subscribe(function(){
    ok.newSearch();
  });

  ok.loadingTemplate = '<li class="messageli placeholder"><img src="img/coffee.gif"/></li><li class="messageli placeholder"></li><li class="messageli placeholder"></li><li class="messageli placeholder"></li>';
  ok.noResultsTemplate = '<li class="messageli noResults"><p class="message-body">No results found for this search. Try removing some filters.<img src="http://stocktwits.com/assets/web/fail-bullbear.gif"/></p></li>';


  ok.render = function(results){
    var msg = results.matches;

    console.time("RENDER");

    ok.$results.html("");

    if(msg.length == 0){
      ok.$results.html(ok.noResultsTemplate);
      return false;
    }else{

    }

    for(var i=0; i<msg.length; i++){

       var listItem =  '<li class="messageli';
           if(msg[i]._source.entities.sentiment && msg[i]._source.entities.sentiment.basic){
              listItem += ' ' + msg[i]._source.entities.sentiment.basic.toLowerCase();
           }
           listItem +=  '">';
           listItem +=      '<div id="message-'+msg[i]._id+'" class="message" data-id="'+msg[i]._id+'" data-username="'+msg[i]._source.user.username+'">';
           listItem +=          '<div class="message-header">';
           listItem +=              '<div class="date-time"><span>'+moment(msg[i]._source.created_at).fromNow()+'</span></div>';
           listItem +=              '<a class="account" href="#%40'+msg[i]._source.user.username+'">';
           listItem +=                  '<div class="account-avatar">'
           listItem +=                  '<img src="'+msg[i]._source.user.avatar_url+'" alt="'+msg[i]._source.user.username+'">';
           listItem +=              '</div>';
           listItem +=              '<strong>'+msg[i]._source.user.username+'</strong>';
           listItem +=          '</a>';
           listItem +=      '</div>';
           listItem +=      '<p class="message-body">'+msg[i]._source.body+'</p>';
           if(msg[i]._source.entities.chart){
              listItem +=  '<p class="message-chart"><img class="isActionable" src="'+msg[i]._source.entities.chart.thumb+'"></p>';
           }
           listItem +=      '<ul class="message-tools">';
           listItem +=          '<li class=""><a class="mt-reply" href="javascript:void(0)">Reply</a></li><li class=""><a class="mt-share" href="javascript:void(0)">Forward</a></li><li><a class="mt-like" href="javascript:void(0)">Like</a></li><li class=""><a class="mt-flag" href="javascript:void(0)">Report</a></li></ul>';
           listItem +=  '</div></li>';

           ok.$results.append(listItem);

    }

    console.timeEnd("RENDER");

    console.time("FORMAT");
    $('.message-body').each(function(){
        var messageText = $(this).html();
        $(this).html(twttr.txt.autoLink(messageText));
    });
    console.timeEnd("FORMAT");
  }

  $(document).on('click', '.fa-times-circle', function(){
    ok.chosenSymbol('All stocks');
    ok.chosenUser('All users');
    ok.chosenContent('All');
    ok.$results.html("");
    ok.updateQuery("");
    ok.$q.val("");
    ok.clearHints();
    ok.$hiddenForm
      .removeAttr('disabled')
      .val("");
    $('.sssearch-helpers').removeClass('whiteGirlWasted');
    parent.location.hash = "";
    ok.goToUserChoice('All users');
    ok.goToSymbolChoice('All stocks');
  });

  $(document).on('keyup', '#addSymbol', function(e){
     var key = e.keyCode || e.which;
     var value = $(this).val().toUpperCase();

     if(value.length > 0){
         if(key == 13 || key == 9) ok.addSymbol();
     }
  });

  $(document).on('keydown', '#addUser', function(e){
     var key = e.keyCode || e.which;
     var value = $(this).val();

     if(value.length > 0){
         if(key == 13 || key == 9) ok.addUser();
     }
  });

  $(document).on('keydown', '#addTerm', function(e){
     var key = e.keyCode || e.which;
     if((key == 13 || key == 9) && $(this).val().length > 0) ok.addTerm();
  });

  $(document).on('keydown', '#sssearch', function(e){
     var key = e.keyCode || e.which;
     if(key == 13 || key == 9) {
           var what = $(this).val().trim();
           if(what.length > 0){
              ok.updateQuery(what);
              $(this).attr('disabled', 'disabled');
              $('.sssearch-helpers').addClass('whiteGirlWasted');
           }

     };
  });

  $(document).on('click', '.btn-group-vertical .btn:last-child', function(){
      $(this).parent().parent().find('input').focus()
    });


  $('.typeahead.users').typeahead(null, {
      displayKey: 'label',
      source: userAutocomplete.ttAdapter(),
      highlight: true,
      templates: {
      empty: [
        '<div class="empty-message">',
        'Unable to find users that match the current query',
        '</div>'
      ].join('\n'),
          suggestion: Handlebars.compile('<p><img class="avatar" src="{{avatar}}"> <strong>{{label}}</strong></p>')
    }
  }).on('typeahead:selected', function($e) {
      var what = $(this).val().trim();
      var where = ok.$q.val();
      ok.updateQuery(where + " @" + what);
      $(this).val("");
      $(this).closest(".tt-hint").val("");
  });


  $('.typeahead.symbols').typeahead(null, {
      displayKey: 'label',
      source: symbolAutocomplete.ttAdapter(),
      highlight: true,
      templates: {
      empty: [
        '<div class="empty-message">',
        'Unable to find symbols that match the current query',
        '</div>'
      ].join('\n'),
          suggestion: Handlebars.compile('<p><strong>{{label}}</strong><br><small>{{title}}</small><span class="exchange">{{exchange}}</span></p>')
    }
  }).on('typeahead:selected', function($e) {
      var what = $(this).val().trim();
      var where = ok.$q.val();
      ok.updateQuery(where + " $" + what);
      $(this).val("");
      $(this).closest(".tt-hint").val("");
  });

  ok.$hiddenForm.typeahead( null,
    {
          displayKey: 'value',
          source: Autocomplete.ttAdapter(),
          hint: true,
          templates: {
              suggestion: Handlebars.compile('{{#if symbol}}<p data-type="symbol"><strong>{{label}}</strong><br><small>{{title}}</small><span class="exchange">{{exchange}}</span></p>{{else}}{{#if user}}<p><img class="avatar"> <strong>{{label}}</strong></p>{{/if}}{{/if}}')
          }
    }).on('typeahead:selected', function($e) {
        var what = $(this).val().trim();
        ok.updateQuery(what);
        $(this).attr('disabled', 'disabled');
    });

    // window.onpopstate = function(event){
    //     ok.checkURL();
    // };

    $(document).ready(function(){
      ok.checkURL();
    });

    $(document).on('click', '.stwt-url, .messageli .account', function(){
      setTimeout(ok.checkURL, 250);
    })

}


ko.applyBindings(new AdvancedSearch());

/* DO NOT USE */
$(document).on('click', '#bradsAd', function(){
  window.location.href = 'http://theworstdrug.com';
});
