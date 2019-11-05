{

	//https://stackoverflow.com/a/10456644
	Object.defineProperty(Array.prototype, 'chunk', {
		value: function(chunkSize) {
		  var R = [];
		  for (var i = 0; i < this.length; i += chunkSize)
			R.push(this.slice(i, i + chunkSize));
		  return R;
		}
	});

	Chart.pluginService.register({
		beforeDraw: function (chart) {
			if (chart.config.options.elements.center) {
				//Get ctx from string
				var ctx = chart.chart.ctx;

				//Get options from the center object in options
				var centerConfig = chart.config.options.elements.center;
				var fontStyle = centerConfig.fontStyle || 'Arial';
				var txt = centerConfig.text;
				var color = centerConfig.color || '#000';
				var sidePadding = centerConfig.sidePadding || 20;
				var sidePaddingCalculated = (sidePadding/100) * (chart.innerRadius * 2)
				//Start with a base font of 30px
				ctx.font = "30px " + fontStyle;

				//Get the width of the string and also the width of the element minus 10 to give it 5px side padding
				var stringWidth = ctx.measureText(txt).width;
				var elementWidth = (chart.innerRadius * 2) - sidePaddingCalculated;

				// Find out how much the font can grow in width.
				var widthRatio = elementWidth / stringWidth;
				var newFontSize = Math.floor(30 * widthRatio);
				var elementHeight = (chart.innerRadius * 2);

				// Pick a new font size so it will not be larger than the height of label.
				var fontSizeToUse = centerConfig.fontSize || Math.min(newFontSize, elementHeight);

				//Set font settings to draw it correctly.
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				var centerX = ((chart.chartArea.left + chart.chartArea.right) / 2);
				var centerY = ((chart.chartArea.top + chart.chartArea.bottom) / 2);
				ctx.font = fontSizeToUse+"px " + fontStyle;
				ctx.fillStyle = color;

				//Draw text in center
				ctx.fillText(txt, centerX, centerY);
			}
		}
	});

	//init variables
	let analysisTab = document.getElementById('analysisTab');
	let debuggerTab = document.getElementById('debuggerTab');
	let fileInput = document.getElementById('fileInput');
	let fileProgress = document.getElementById('fileProgress');
	let parseProgress = document.getElementById('parseProgress');
	let jobsProgress = document.getElementById('jobsProgress');
	let fileProgressDiv = document.getElementById('fileProgressDiv');
	let parseProgressDiv = document.getElementById('parseProgressDiv');
	let jobsProgressDiv = document.getElementById('jobsProgressDiv');
	let jobNav = document.getElementById('jobNav');
	let timingButton = document.getElementById('timing-button');
	let logTypeButton = document.getElementById('logType-button');
	let chunksDiv = document.getElementById('chunksDiv');
	let timelineGraphDiv = document.getElementById('timelineGraphDiv');
	let levelGraphDiv = document.getElementById('levelGraphDiv');
	let files = [];
	let logs = [];
	let jobs = [];
	let logsTable;
	let timelineGraph;
	let levelGraph;
	let donutChart;
	let selectedJob;
	let jobID = document.getElementById('jobID');
	let processName = document.getElementById('processName');
	let reader = new FileReader();
	let filesToRead = [];
	let selectedChunk = 0;
	let debuggerTable;
	let variablesTable;
	let variablesTableDiv = document.getElementById("variablesTable");
	let argumentsTable;
	let argumentsTableDiv = document.getElementById("argumentsTable");
	let variablesButton = document.getElementById("variables-button");
	let argumentsButton = document.getElementById("arguments-button");

	//initialize progressbars
	fileProgressDiv.style.display = "none";
	parseProgressDiv.style.display = "none";
	jobsProgressDiv.style.display = "none";

	//file input event
	function readFiles(event) {
		fileProgressDiv.style.display = "";
		filesToRead = [...fileInput.files];
		parseProgress.MaterialProgress.setProgress(0);
		jobsProgress.MaterialProgress.setProgress(0);
	    performRead();
	}

	function performRead(){
		
	    function progressUpdate(event){
		    if (event.lengthComputable) {
				let percent = Math.round((event.loaded / event.total) * 100);
				fileProgress.MaterialProgress.setProgress(percent);
			}
	    }

	    if (filesToRead.length > 0) { // if we still have files left
	       	let f = filesToRead.shift(); // remove first from queue and store in file

	       	reader.onprogress = progressUpdate;
			reader.onloadend = function (loadEvent) { // when finished reading file, call recursive readFiles function
	           f.content = loadEvent.target.result
	           files.push(f);
	           performRead();
	       	}
	       	reader.readAsText(f);

	   	} else {
    	   afterFileRead() // no more files to read
	   	}
	}

	//trigger next steps
	function afterFileRead(){

		extractLogs();
		analysisTab.style.display = "";
		window.onbeforeunload = function(){
			return 'Are you sure you want to leave?';
		};
		createAnalytics();
		generateJobDrawer();
		analysisTab.click();
		loadStatus.innerText = `Log Processing Successful`

	}

	//separate logs using regex
	function extractLogs(){
		parseProgressDiv.style.display = "";
		parseProgress.classList.add('mdl-progress__indeterminate')
		
		logs.original = [];
		logs.formatted = [];

		files.map(file=>{
			//segregate first via global flag
			let extractedLogs = file.content.match(/^(\d{2}:\d{2}:\d{2}\.\d{4}) (\w*) ({.*})$/gm);
			[...logs.original, ...extractedLogs];
			
			//convert to JSON each item
			extractedLogs.map(log => {
				let m = log.match(/^(\d{2}:\d{2}:\d{2}\.\d{4}) (\w*) ({.*})$/m);
				let extractedFLogs = JSON.parse(m[3]);
				extractedFLogs.sourceFile = file.name;
				logs.formatted.push(extractedFLogs);
			})

		})
		
		parseProgress.classList.remove('mdl-progress__indeterminate')
		parseProgress.MaterialProgress.setProgress(100);

	}

	function generateAnalysis(job){

		//check if selected and highlight
		let selection = event.target;
		if(!selection.classList.contains("job-list"))
			selection = selection.parentNode;
		if(selection.classList.contains('analysis-selected'))
			return
		else{
			let jobList = document.getElementsByClassName('job-list');
			[...jobList].map(j=>{
				j.classList.remove('analysis-selected');
			})
			selection.classList.add('analysis-selected');
		}
		
		selectedJob = job;

		//initialize graphs
		timingButton.setAttribute("disabled","");
		logTypeButton.removeAttribute("disabled");
		timelineGraphDiv.style.display = "";
		levelGraphDiv.style.display = "none";

		//get labels
		let labels = [];
		let shortLabels = [];
		let diffData = [];
		let totalData = [];
		let timeData = [];
		let timeSum = 0;
		let unknownData = [];
		let errorData = [];
		let warningData = [];
		let informationData = [];
		let traceData = [];
		let donutData = [0,0,0,0,0];
		job.map(log=>{
			labels.push(log.timeStamp);
			let d = new Date(log.timeStamp)
			shortLabels.push(`${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`);
			diffData.push(log.difference);
			totalData.push(log.totalTime);
			timeData.push(timeSum+=log.difference);

			switch(log.level){
				
				case "Verbose":
				case "Trace":
					unknownData.push(0);
					errorData.push(0);
					warningData.push(0);
					informationData.push(0);
					traceData.push(1);
					donutData[0]+=1;
					break;
				case "Information":
					unknownData.push(0);
					errorData.push(0);
					warningData.push(0);
					informationData.push(1);
					traceData.push(0);
					donutData[1]+=1;
					break;
				case "Warning":
					unknownData.push(0);
					errorData.push(0);
					warningData.push(1);
					informationData.push(0);
					traceData.push(0);
					donutData[2]+=1;
					break;
				case "Error":
					unknownData.push(0);
					errorData.push(1);
					warningData.push(0);
					informationData.push(0);
					traceData.push(0);
					donutData[3]+=1;
					break;
				default:
					unknownData.push(1);
					errorData.push(0);
					warningData.push(0);
					informationData.push(0);
					traceData.push(0);
					donutData[4]+=1;
					break;

			}

		})

		//Convert to chunks
		labels = labels.chunk(50000);
		shortLabels = shortLabels.chunk(50000);
		diffData = diffData.chunk(50000);
		totalData = totalData.chunk(50000);
		timeData = timeData.chunk(50000);
		unknownData = unknownData.chunk(50000);
		errorData = errorData.chunk(50000);
		warningData = warningData.chunk(50000);
		informationData = informationData.chunk(50000);
		traceData = traceData.chunk(50000);

		//generate chunk buttons
		chunksDiv.innerHTML = "";
		if(labels.length > 1)
			for(let i = 0; i < labels.length; i++){
				let label = `${(i*50)}${i==0?"":"K"}-${((i+1)*50)}K`
				let a = document.createElement("a");
				a.onclick = function(){updateGraphs(i);}
				a.classList.add("chunkButton")
				a.innerText = label;
				chunksDiv.appendChild(a);
			}

		function convertDataToVariablesTable(data){
			let t = [];
			if(!data.activityInfo)
				return t;
			if(!data.activityInfo.Variables)
				return t;
			let names = Object.keys(data.activityInfo.Variables);
			names.map(name=>{
				let v = data.activityInfo.Variables[name];
				if(isNaN(v) && !(v == "True" || v == "False")){
					v = `"${v}"`;
				}
				t.push({"variable":name, "value":v});
			})
			return t;
		}

		function convertDataToArgumentsTable(data){
			let t = [];
			if(!data.activityInfo)
				return t;
			if(!data.activityInfo.Arguments)
				return t;
			let names = Object.keys(data.activityInfo.Arguments);
			names.map(name=>{
				let v = data.activityInfo.Arguments[name];
				if(isNaN(v) && !(v == "True" || v == "False")){
					v = `"${v}"`;
				}
				t.push({"argument":name, "value":v});
			})
			return t;
		}

		function analysisTableRowDblClicked(e, row){
			//update debugger tab, replace table

			//console.log(e,row);
			let data = row["_row"].data;
			
			debuggerTab.style.display = "";
			jobID.innerHTML = data.jobId;
			processName.innerHTML = data.processName;
			debuggerTab.click();

			function debuggerTableRowClick(e, row){

				let data = row["_row"].data;
				debuggerTable.deselectRow();
				debuggerTable.selectRow(data.timeStamp);
				variablesTable.replaceData(convertDataToVariablesTable(data));
				argumentsTable.replaceData(convertDataToArgumentsTable(data));

			}

			//create tables
			//debugger table
			if(debuggerTable)
				debuggerTable.destroy();
			debuggerTable = new Tabulator("#debuggerTable", {
				data:job,      //load row data from array
				layout:"fitColumns",      //fit columns to width of table
				//responsiveLayout:"hide",  //hide columns that dont fit on the table
				tooltips:true,            //show tool tips on cells
				//addRowPos:"top",          //when adding a new row, add it to the top of the table
				//history:true,             //allow undo and redo actions on the table
				height: 600,
				index: "timeStamp",
				//pagination:"local",       //paginate the data
				//paginationSize:100,         //allow 7 rows per page of data
				movableColumns:true,      //allow column order to be changed
				resizableRows:false,       //allow row order to be changed
				scrollToRowPosition: "top",
				scrollToRowIfVisible: true,
				initialSort:[             //set the initial sort order of the data
					{column:"timeStamp", dir:"asc"},
				],
				columns:[                 //define the table columns
					{title:"TimeStamp", field:"timeStamp", editor:false, width: 300, sorter:"datetime", sorterParams:{format: "YYYY-MM-DDTHH:mm:ss.SSSZ"}},
					{title:"Level", field:"level", editor:false, width:100},
					{title:"Message", field:"message", editor:false},
					{title:"Millisecs", field:"difference", editor:false, width:110},
					{title:"Total Time", field:"totalTime", editor:false, width:130},
					{title:"Stack No", field:"stackNo", editor:false, width:130},
					{title:"Start Time", field:"startTS", editor:false, width:130},
				],
				rowClick:debuggerTableRowClick,
			});

			if(variablesTable)
				variablesTable.destroy();
			variablesTable = new Tabulator("#variablesTable", {
				data:convertDataToVariablesTable(data),      //load row data from array
				layout:"fitColumns",      //fit columns to width of table
				//responsiveLayout:"hide",  //hide columns that dont fit on the table
				tooltips:true,            //show tool tips on cells
				//addRowPos:"top",          //when adding a new row, add it to the top of the table
				//history:true,             //allow undo and redo actions on the table
				height: 600,
				index: "timeStamp",
				//pagination:"local",       //paginate the data
				//paginationSize:100,         //allow 7 rows per page of data
				movableColumns:true,      //allow column order to be changed
				resizableRows:false,       //allow row order to be changed
				scrollToRowPosition: "top",
				scrollToRowIfVisible: true,
				initialSort:[             //set the initial sort order of the data
					{column:"timeStamp", dir:"asc"},
				],
				columns:[                 //define the table columns
					{title:"Variable Name", field:"variable", editor:false},
					{title:"Value", field:"value", editor:false},
				],
				//rowClick:debuggerTableRowClick,
			});

			if(argumentsTable)
				argumentsTable.destroy();
			argumentsTable = new Tabulator("#argumentsTable", {
				data:convertDataToArgumentsTable(data),      //load row data from array
				layout:"fitColumns",      //fit columns to width of table
				//responsiveLayout:"hide",  //hide columns that dont fit on the table
				tooltips:true,            //show tool tips on cells
				//addRowPos:"top",          //when adding a new row, add it to the top of the table
				//history:true,             //allow undo and redo actions on the table
				height: 600,
				index: "timeStamp",
				//pagination:"local",       //paginate the data
				//paginationSize:100,         //allow 7 rows per page of data
				movableColumns:true,      //allow column order to be changed
				resizableRows:false,       //allow row order to be changed
				scrollToRowPosition: "top",
				scrollToRowIfVisible: true,
				initialSort:[             //set the initial sort order of the data
					{column:"timeStamp", dir:"asc"},
				],
				columns:[                 //define the table columns
					{title:"Argument Name", field:"argument", editor:false},
					{title:"Value", field:"value", editor:false},
				],
				//rowClick:debuggerTableRowClick,
			});


			//Go to Row
			debuggerTable.clearFilter();
			debuggerTable.clearSort();
			debuggerTable.deselectRow();
			debuggerTable.scrollToRow(data.timeStamp);
			debuggerTable.selectRow(data.timeStamp);

			//Show variables for the Activity
			showVariables();
			
		}

		//create table
		//logsTable
		if(logsTable)
			logsTable.destroy();
		logsTable = new Tabulator("#logsTable", {
			data:job,      //load row data from array
			layout:"fitColumns",      //fit columns to width of table
			//responsiveLayout:"hide",  //hide columns that dont fit on the table
			tooltips:true,            //show tool tips on cells
			//addRowPos:"top",          //when adding a new row, add it to the top of the table
			//history:true,             //allow undo and redo actions on the table
			height: 400,
			index: "timeStamp",
			//pagination:"local",       //paginate the data
			//paginationSize:100,         //allow 7 rows per page of data
			movableColumns:true,      //allow column order to be changed
			resizableRows:false,       //allow row order to be changed
			scrollToRowPosition: "top",
			scrollToRowIfVisible: true,
			initialSort:[             //set the initial sort order of the data
				{column:"timeStamp", dir:"asc"},
			],
			columns:[                 //define the table columns
				{title:"TimeStamp", field:"timeStamp", editor:false, width: 300, sorter:"datetime", sorterParams:{format: "YYYY-MM-DDTHH:mm:ss.SSSZ"}},
				{title:"Level", field:"level", editor:false, width:100},
				{title:"Message", field:"message", editor:false},
				{title:"Millisecs", field:"difference", editor:false, width:110},
				{title:"Total Time", field:"totalTime", editor:false, width:130},
				//{title:"Stack No", field:"stackNo", editor:false, width:130},
				//{title:"Start TS", field:"startTS", editor:false, width:130},
			],
			rowDblClick:analysisTableRowDblClicked,
		});

		setTimeout(function(){logsTable.redraw();}, 300);

		/*{
			"start" = logs.formatted[0].timeStamp,
			"end" = logs.formatted[logs.formatted.length-1].timeStamp,
		}*/

		//generate chart
		//x-axis = start to end time
		//y-axis = timestamps

		function timelineClick(event, array){
			logsTable.clearFilter();
			logsTable.clearSort();
			if(array.length > 0){
				logsTable.deselectRow();
				logsTable.scrollToRow(labels[selectedChunk][array[0]['_index']]);
				logsTable.selectRow(labels[selectedChunk][array[0]['_index']]);
			}
		}

		function filterUnkown(data, filterParams){
			return !(data.level == "Error" || data.level == "Warning" || data.level == "Information" || data.level == "Trace")
		}

		function filterTrace(data, filterParams){
			return (data.level == "Verbose" || data.level == "Trace")
		}

		function donutClick(event, array){
			//sort table
			if(array.length > 0){
				switch(array[0]["_index"]){
					case 0: logsTable.setFilter(filterTrace);
						break;
					case 1: logsTable.setFilter("level","=","Information");
						break;
					case 2: logsTable.setFilter("level","=","Warning");
						break;
					case 3: logsTable.setFilter("level","=","Error");
						break;
					case 4: logsTable.setFilter(filterUnkown);
						break;
				}
			}
			setTimeout(function(){
				//update number in donut
				let total = 0;
				if(!donutChart.legend.legendItems[0].hidden)
					total += donutData[0];
				if(!donutChart.legend.legendItems[1].hidden)
					total += donutData[1];
				if(!donutChart.legend.legendItems[2].hidden)
					total += donutData[2];
				if(!donutChart.legend.legendItems[3].hidden)
					total += donutData[3];
				if(!donutChart.legend.legendItems[4].hidden)
					total += donutData[4];

				donutChart.options.elements.center.text = total;
				donutChart.update()
			}, 50);
		}
		
		let opt = {}

		if(shortLabels[0].length > 3000)
			opt = {
				maintainAspectRatio: false,
				onClick: timelineClick,
				elements: {
					line: {
						tension: 0 // disables bezier curves
					}
				},
				animation: {
					duration: 0 // general animation time
				},
				hover: {
					animationDuration: 0 // duration of animations when hovering an item
				},
				responsiveAnimationDuration: 0,
			}
		else
			opt = {
				maintainAspectRatio: false,
				onClick: timelineClick,
			}

		if(timelineGraph)
			timelineGraph.destroy();
		let ctx = document.getElementById('timelineGraph')
		timelineGraph = new Chart(ctx, {
			type: 'line',
			data: {
				labels: shortLabels[0],
				datasets: [
				{
				label: 'Difference From Last Activity',
				borderColor: 'rgba(216, 86, 4, 1)',
				backgroundColor: 'rgba(216, 86, 4, .5)',
				data: diffData[0],
				},
				{
				label: 'Total Execution Time of Activity',
				borderColor: 'rgba(232, 141, 20, 1)',
				backgroundColor: 'rgba(232, 141, 20, .5)',
				data: totalData[0],	
				},
				{
				label: 'Sum of Time Differences',
				borderColor: 'rgba(243, 190, 38, 1)',
				backgroundColor: 'rgba(243, 190, 38, .5)',
				borderWIdth: 1,
				pointRadius: 0.25,
				pointHitRadius: 0.25,
				data: timeData[0],	
				}
				]
			},
			options: opt
		});
		
		if(levelGraph)
			levelGraph.destroy();
		let ctx2 = document.getElementById('levelGraph')
			levelGraph = new Chart(ctx2, {
			type: 'line',
			data: {
				labels: shortLabels[0],
				datasets: [
				{
				label: 'Unknown',
				borderColor: 'rgba(173, 27, 2, 1)',
				backgroundColor: 'rgba(173, 27, 2, .5)',
				data: unknownData[0],
				},
				{
				label: 'Error',
				borderColor: 'rgba(216, 86, 4, 1)',
				backgroundColor: 'rgba(216, 86, 4, .5)',
				data: errorData[0],
				},
				{
				label: 'Warning',
				borderColor: 'rgba(232, 141, 20, 1)',
				backgroundColor: 'rgba(232, 141, 20, .5)',
				data: warningData[0],	
				},
				{
				label: 'Information',
				borderColor: 'rgba(243, 190, 38, 1)',
				backgroundColor: 'rgba(243, 190, 38, .5)',
				data: informationData[0],	
				},
				{
				label: 'Trace',
				borderWIdth: 1,
				pointRadius: 0.25,
				pointHitRadius: 0.25,
				data: traceData[0],	
				}
				]
			},
			options: opt
		});

		function updateGraphs(chunkIndex){
			
			selectedChunk = chunkIndex;
			let opt = {}

			if(shortLabels[chunkIndex].length > 3000){
				opt = {
					maintainAspectRatio: false,
					onClick: timelineClick,
					elements: {
						line: {
							tension: 0 // disables bezier curves
						}
					},
					animation: {
						duration: 0 // general animation time
					},
					hover: {
						animationDuration: 0 // duration of animations when hovering an item
					},
					responsiveAnimationDuration: 0,
				}
			}else{
				opt = {
					maintainAspectRatio: false,
					onClick: timelineClick,
				}
			}

			timelineGraph.options = opt;
			levelGraph.options = opt;
			timelineGraph.data = {
				labels: shortLabels[chunkIndex],
				datasets: [
				{
				label: 'Difference From Last Activity',
				borderColor: 'rgba(216, 86, 4, 1)',
				backgroundColor: 'rgba(216, 86, 4, .5)',
				data: diffData[chunkIndex],
				},
				{
				label: 'Total Execution Time of Activity',
				borderColor: 'rgba(232, 141, 20, 1)',
				backgroundColor: 'rgba(232, 141, 20, .5)',
				data: totalData[chunkIndex],	
				},
				{
				label: 'Sum of Time Differences',
				borderColor: 'rgba(243, 190, 38, 1)',
				backgroundColor: 'rgba(243, 190, 38, .5)',
				borderWIdth: 1,
				pointRadius: 0.25,
				pointHitRadius: 0.25,
				data: timeData[chunkIndex],	
				}
				]
			};

			levelGraph.data = {
				labels: shortLabels[chunkIndex],
				datasets: [
				{
				label: 'Unknown',
				borderColor: 'rgba(173, 27, 2, 1)',
				backgroundColor: 'rgba(173, 27, 2, .5)',
				data: unknownData[chunkIndex],
				},
				{
				label: 'Error',
				borderColor: 'rgba(216, 86, 4, 1)',
				backgroundColor: 'rgba(216, 86, 4, .5)',
				data: errorData[chunkIndex],
				},
				{
				label: 'Warning',
				borderColor: 'rgba(232, 141, 20, 1)',
				backgroundColor: 'rgba(232, 141, 20, .5)',
				data: warningData[chunkIndex],	
				},
				{
				label: 'Information',
				borderColor: 'rgba(243, 190, 38, 1)',
				backgroundColor: 'rgba(243, 190, 38, .5)',
				data: informationData[chunkIndex],	
				},
				{
				label: 'Trace',
				borderWIdth: 1,
				pointRadius: 0.25,
				pointHitRadius: 0.25,
				data: traceData[chunkIndex],	
				}
				]
			};
			
			timelineGraph.update();
			levelGraph.update();
			
		}
		
		if(donutChart)
			donutChart.destroy();
		let ctx3 = document.getElementById('donutChart')
		donutChart = new Chart(ctx3, {
		    type: 'doughnut',
		    data: {
				datasets: [{
					data: donutData,
					backgroundColor: [
						'#CCC',
						'rgba(243, 190, 38, 1)',
						'rgba(232, 141, 20, 1)',
						'rgba(216, 86, 4, 1)',
						'rgba(173, 27, 2, 1)',
					],
					label: 'Dataset 1'
				}],
				labels: [
					'Trace',
					'Information',
					'Warning',
					'Error',
					'Unknown',
				]
			},
			options: {
		    	maintainAspectRatio: false,
				responsive: true,
				legend: {
					position: 'top',
				},
				/*title: {
					display: true,
					text: 'Chart.js Doughnut Chart'
				},*/
				animation: {
					animateScale: true,
					animateRotate: true
				},
			    onClick: donutClick,
				elements: {
					center: {
						text: job.length,
						color: '#333', //Default black
						//fontStyle: '', //Default Arial
						sidePadding: 20 //Default 20 (as a percentage)
					}
				}
			}
		});
		
	}

	//gets unique list of States from current job
	function getStates(){

		let l = [];
		selectedJob.map(log=>{
			if(log.activityInfo)
				if(!l.includes(log.activityInfo.State))
					l.push(log.activityInfo.State)
		})
		console.log(l);

	}

	function createAnalytics(){
		jobsProgressDiv.style.display = "";
		jobsProgress.classList.add('mdl-progress__indeterminate')

		//pair executing and closing logs
		let pairStack = [];
		let stackNo = 0;
		logs.formatted.map(log=>{
			if(log.activityInfo){
				if(log.activityInfo.State == "Executing"){
					log.stackNo = stackNo++;
					pairStack.push(log)
				}else if(log.activityInfo.State == "Closed" || log.activityInfo.State == "Faulted" || log.activityInfo.State == "Canceled"){
					let stackDup = [...pairStack];
					let stackNoDup = stackNo;
					let start = stackDup.pop();
					stackNoDup--;
					if(!start)
						return;
					while(start != undefined && start.activityInfo.DisplayName != log.activityInfo.DisplayName){
						start = stackDup.pop();
						stackNoDup--;
					}
					if(!start){//undefined
						log.totalTime = 0;
					}else{
						let diff = (new Date(log.timeStamp)) - (new Date(start.timeStamp));
						pairStack = [...stackDup];
						stackNo = stackNoDup;
						start.totalTime = 0;
						log.stackNo = stackNo;
						log.totalTime = diff;
						log.startFP = start.fingerprint;
						log.startTS = start.timeStamp;
					}
					
				/*
				}else if(log.activityInfo.State == "Faulted"){
					let start = pairStack.pop();
					if(!start)
						return;
					if(start.activityInfo.DisplayName != log.activityInfo.DisplayName){
						console.log(log, start);
						log.totalTime = 0;
						pairStack.push(start);
					}else{
						let diff = (new Date(log.timeStamp)) - (new Date(start.timeStamp));
						stackNo--;
						start.totalTime = 0;
						log.stackNo = stackNo;
						log.totalTime = diff;
						log.startFP = start.fingerprint;
						log.startTS = start.timeStamp;
					}*/
				}
			/*}else if(log.level == "Information"){
				if(log.totalExecutionTime){
					let start = pairStack.pop();
					let diff = (new Date(log.timeStamp)) - (new Date(start.timeStamp));
					start.totalTime = 0;
					log.totalTime = diff;
					log.startFP = start.fingerprint;
					log.startTS = start.timeStamp;
				}else if(log.message.endsWith("execution started")){
					pairStack.push(log);
				}else{
					log.totalTime = 0;
				}
			*/}else{
				log.totalTime = 0;
			}
		})

		//group together same jobIds
		jobs = [];
		//aggregate timestamp differences
		let prev_jobID = ""
		let tempJob = [];
		for(let i = 0; i < logs.formatted.length; i++){
			if(logs.formatted[i].jobId != prev_jobID){
				if(tempJob.length > 0)
					jobs.push(tempJob);
				tempJob = [];
				logs.formatted[i].difference = 0;
				prev_jobID = logs.formatted[i].jobId
				tempJob.push(logs.formatted[i]);
			}
			else{
				logs.formatted[i].difference = (new Date(logs.formatted[i].timeStamp)) - (new Date(logs.formatted[i-1].timeStamp));
				tempJob.push(logs.formatted[i]);
			}
		}
		jobs.push(tempJob);

		//initialize analysis page
		timingButton.setAttribute("disabled","");
		logTypeButton.setAttribute("disabled","");
		if(logsTable)
			logsTable.destroy();
		if(timelineGraph)
			timelineGraph.destroy();
		if(levelGraph)
			levelGraph.destroy();



		jobsProgress.classList.remove('mdl-progress__indeterminate')
		jobsProgress.MaterialProgress.setProgress(100);

	}

	function generateJobDrawer(){

		jobNav.innerHTML = "";

		//create nodes
		jobs.map(job=>{
			let button = document.createElement("a")
			button.classList.add("mdl-navigation__link");
			button.classList.add("job-list");
			button.href = "#";
			button.innerHTML = `"${job[0].sourceFile}"<br><strong>${job[0].processName}</strong><br>${job.length} logs<br>${(new Date(job[0].timeStamp)).toLocaleString()}`
			button.onclick = function(){generateAnalysis(job)};
			jobNav.appendChild(button);
		})

	}

	function showVariables(){
		variablesTableDiv.style.display = "";
		variablesButton.setAttribute("disabled","");
		argumentsTableDiv.style.display = "none";
		argumentsButton.removeAttribute("disabled","");
	}

	function showArguments(){
		variablesTableDiv.style.display = "none";
		variablesButton.removeAttribute("disabled","");
		argumentsTableDiv.style.display = "";
		argumentsButton.setAttribute("disabled","");		
	}

	function showTimelineGraph(){
		timingButton.setAttribute("disabled","");
		logTypeButton.removeAttribute("disabled");
		timelineGraphDiv.style.display = "";
		levelGraphDiv.style.display = "none";
	}

	function showLevelGraph(){
		timingButton.removeAttribute("disabled");
		logTypeButton.setAttribute("disabled","");
		timelineGraphDiv.style.display = "none";
		levelGraphDiv.style.display = "";
	}

	function toDateTimeString(timeStamp){

		let d = new Date(timeStamp);

		return (String(d.getDate()).padStart(2, "0")) + "/" +
			String(d.getMonth()+1).padStart(2, "0") + "/" +
			d.getFullYear() + " " +
			""

	}
	
}

//dialogs
{
	//About Dialog
	var aboutDialog = document.querySelector('dialog#about');
    var showAboutDialogBtn = document.querySelector('#show-about');
    if (! aboutDialog.showModal) {
      dialogPolyfill.registerDialog(aboutDialog);
    }
    showAboutDialogBtn.addEventListener('click', function() {
      aboutDialog.showModal();
    });
    aboutDialog.querySelector('.close').addEventListener('click', function() {
      aboutDialog.close();
    });

    //Help Dialog
	var helpDialog = document.querySelector('dialog#help');
    var showHelpDialogBtn = document.querySelector('#show-help');
    if (! helpDialog.showModal) {
      dialogPolyfill.registerDialog(helpDialog);
    }
    showHelpDialogBtn.addEventListener('click', function() {
      helpDialog.showModal();
    });
    helpDialog.querySelector('.close').addEventListener('click', function() {
      helpDialog.close();
    });
}