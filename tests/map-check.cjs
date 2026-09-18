const fs=require('fs'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../public/assets/app.js'),'utf8');
const start=source.indexOf('const AIRPORT_REFERENCE'), end=source.indexOf('function setupMap()',start);
const elements={};for(const id of ['map-mode','map-grid','map-zoom','position-map','position-readout','map-scale','command-kind'])elements[id]={value:'',setAttribute(k,v){this[k]=v;}};
elements['map-mode'].value='coordinates';elements['map-grid'].value='100';elements['map-zoom'].value='1';elements['command-kind'].value='explosion';
const values={x:'100',y:'20',z:'-35',value2:'150'}, project={mapSettings:{}};
const context={$:id=>elements[id],project:()=>project,draftValues:()=>values,valid:true,t:s=>s,escapeHTML:s=>s};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
context.drawMap();assert.equal(elements['position-map'].viewBox,'-400 -451.6666666666667 1000 833.3333333333334');assert(elements['position-map'].innerHTML.includes('r="150"'));
const original=elements['position-map'].viewBox;values.value2='300';context.drawMap();assert.equal(elements['position-map'].viewBox,original);assert(elements['position-map'].innerHTML.includes('r="300"'));
elements['map-mode'].value='terrain';context.drawMap();assert(elements['position-map'].innerHTML.includes('data-explosion-radius'));assert(elements['position-map'].innerHTML.includes('/assets/ronograd.png'));
project.mapSettings={units:'2000',ox:'0',oz:'0',direction:'south'};values.x='2000';values.z='-2000';context.drawMap();assert(elements['position-map'].innerHTML.includes('cx="1000" cy="4000" r="150"'));
elements['map-mode'].value='coordinates';elements['map-grid'].value='-10';context.drawMap();assert(elements['position-map'].viewBox.endsWith('10 8.333333333333334'));
console.log('5 map checks passed: fixed scale, radius geometry, uncalibrated guard, unit conversion, invalid grid bounds');


const transform=vm.runInContext('referenceTransform()',context);const airport=vm.runInContext('AIRPORT_REFERENCE',context),city=vm.runInContext('CITY_REFERENCE',context);for(const anchor of [airport,city]){const mapped=transform.point(anchor);assert(Math.abs(mapped.x-anchor.east)<1e-8);assert(Math.abs(mapped.y-(5000-anchor.north))<1e-8);}assert(transform.scale>0);console.log('Both user reference coordinates map to their marked areas.');
