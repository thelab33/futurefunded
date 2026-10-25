const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
module.exports=function install(root){
 const requireAt=Module.createRequire(path.join(root,'package.json'));
 const ts=requireAt('typescript'),resolve=Module._resolveFilename;
 Module._resolveFilename=function(name,parent,...rest){
  if(name==='server-only')return require.resolve('./ff-payment-server-only.cjs');
  if(name.startsWith('@/'))name=path.join(root,'src',name.slice(2));
  return resolve.call(this,name,parent,...rest);
 };
 require.extensions['.ts']=function(module,filename){
  const result=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
  module._compile(result.outputText,filename);
 };
 return name=>require(path.join(root,name));
};
