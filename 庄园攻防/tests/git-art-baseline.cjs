'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=function gitArtBaseline(root){
 const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']};
 const repository=execFileSync('git',['rev-parse','--show-toplevel'],options).trim();
 const current=path.relative(repository,root).replaceAll('\\','/');
 // A renamed working directory may still be compared against the previous commit.
 const paths=[`${current}/js/art.js`,'古坊奇谭/js/art.js'];
 let lastError;
 for(const file of new Set(paths))try{return execFileSync('git',['show',`HEAD:${file}`],options);}catch(error){lastError=error;}
 throw lastError;
};
