'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../Admin/AgendaSearch.html'),'utf8').match(/<script>([^]*?)<\/script>/)[1],context);
module.exports={filter:context.filterAgendaRecords_};
