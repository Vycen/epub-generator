/**
 * Created by Emile_Bex on 08/11/2017.
 */

const fs = require('fs');
const os = require("os");
const Xec = require("child_process").execSync;
const _path = require('path');
const showdown  = require('showdown');
const converter = new showdown.Converter();
const JSZip = require("jszip");

del = os.platform() === 'win32' ? "rmdir /s /q " : "rm -Rf ";

var depth = 0;
const outDir = '__output';
const buildDir='build';

const EXCLUSIONS=["node_modules", ".git", ".", "..", outDir, buildDir, 'cover.png'];



const IMAGES=[".png",".jpg",".jpeg",".gif"];
var assets=[];
var pages=[];

var HEADER = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n'+
  '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">\n'+
  '<head>\n'+
  '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>\n'+
  '</head>\n'+
  '<body>\n';

var FOOTER ='</body></html>';

function browse(path, depth){
  var _files = fs.readdirSync(path);
  var _fullPath;
  var _transformedFileName;

  for(var _i=0; _i<_files.length; _i++){
    if(EXCLUSIONS.indexOf(_files[_i])!= -1 ) continue;
    _fullPath = path+"/"+_files[_i];

    if(fs.lstatSync(_fullPath).isDirectory()){
      browse(_fullPath, depth+1)
    }
    else if(depth>0){
      var _xt = _path.extname(_fullPath).toLowerCase();
      if(IMAGES.indexOf(_xt) != -1){
        if( assets.indexOf(_files[_i]) == -1 ){
          fs.createReadStream(_fullPath).pipe(fs.createWriteStream(outDir+"/"+_files[_i]));
          assets.push(_files[_i]);
        }
        else{
          console.log("/!\\ Duplicate assets detected : ", _fullPath);
          console.log("🛶  Using escape pod 🛶 ");
          process.exit(1);
        }
      }
      else if(_xt == '.md'){
        var _md = fs.readFileSync(_fullPath, 'utf8', { flag: 'wx' });
        _fullPath = _fullPath.replace(_xt,'');
        _transformedFileName = _fullPath.substr(2).replace(new RegExp(/\//, 'g'),"_")+'.xhtml';
        fs.writeFileSync(outDir+"/"+_transformedFileName, HEADER+converter.makeHtml(_md)+FOOTER);
        var _title = _md.match(/^#(.*)/g);
        if(!_title){
          console.log("No title set for ", _fullPath);
          _title = ["__TO BE MODIFIED__"];
        }
        pages.push({src:_transformedFileName, title:_title[0]});
        console.log('[i] Done converting '+ _fullPath)
      }
    }

  }
}

function build(){
  //Cleansing
  if (fs.existsSync(buildDir)){
    Xec(del+'./'+buildDir);
  }


  fs.mkdirSync(buildDir);

  //create structure
  fs.mkdirSync(buildDir+"/EPUB");
  fs.mkdirSync(buildDir+"/META-INF");

  fs.createReadStream(__dirname + "/templates/mimetype").pipe(fs.createWriteStream(buildDir+"/mimetype"));


  pages.map((page)=>fs.createReadStream(outDir+"/"+page.src).pipe(fs.createWriteStream(buildDir+"/EPUB/"+page.src)));
  assets.map((asset)=>fs.createReadStream(outDir+"/"+asset).pipe(fs.createWriteStream(buildDir+"/EPUB/"+asset)));

  fs.createReadStream(__dirname + "/templates/container.xml").pipe(fs.createWriteStream(buildDir+"/META-INF/container.xml"));

  //Generate title page
  var _strTitlePage = fs.readFileSync(__dirname + "/templates/titlepage.xhtml").toString();
  var _LIs = pages.reduce(function(acc, val){
    return acc+"<li><a href='"+val.src+"'>"+val.title+"</a></li>\n";
  }, "");

  fs.writeFileSync(buildDir+"/EPUB/titlepage.xhtml", _strTitlePage.replace("%LIs%", _LIs));

  var _items="";
  var _spines="";

  for(var _i=0; _i<pages.length;_i++){
    _items = _items + "<item id='it"+_i+"' media-type='application/xhtml+xml' href='"+pages[_i].src+"' />\n";
    _spines= _spines+ "<itemref idref='it"+_i+"'/>\n";
  }
  var _strPackager = fs.readFileSync(__dirname + "/templates/package.opf").toString();
  _strPackager = _strPackager.replace('%TITLE%', EPUB_TITLE);
  _strPackager =_strPackager.replace("%ITEMS%", _items );
  _strPackager = _strPackager.replace("%SPINE%", _spines );
  fs.writeFileSync(buildDir+"/EPUB/package.opf", _strPackager);

  fs.createReadStream(__dirname + "/templates/cover.png").pipe(fs.createWriteStream(buildDir+"/EPUB/cover.png"));
}

function archive() {
  var zip = new JSZip();
  walk(buildDir, zip, function(err, results) {
    if (err) {
      throw err;
    }
    else {
      console.log(results);
      zip
        .generateNodeStream({type:'nodebuffer',streamFiles:true})
        .pipe(fs.createWriteStream('out.epub'))
        .on('finish', function () {
          // JSZip generates a readable stream with a "end" event,
          // but is piped here in a writable stream which emits a "finish" event.
          console.log("out.epub written.");
        });
    }
  });


}

var walk = function(dir, zip, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, zip, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          fs.readFile(file, function(err, data) {
            if (err) {
              throw err;
            }
            else {
              zip.file(file.replace(buildDir + '/', ''), data);
              next();
            }
          });
        }
      });
    })();
  });
};


if (fs.existsSync(outDir)){
  Xec(del+'./'+outDir, function(d){console.log(d)});
}
fs.mkdirSync(outDir);

var idx = process.argv.indexOf('-t');
var EPUB_TITLE = "";
if(idx != -1 && process.argv[idx+1]){
  EPUB_TITLE = process.argv[idx+1];
}
else{
  console.log("/!\\ EPUB title is missing ");
}


module.exports = function (path) {
  //browse and convert files to output
  browse(path, depth);
  build();
  archive();
};








