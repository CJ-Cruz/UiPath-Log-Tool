/*/
window.onbeforeunload = function(){
  return 'Are you sure you want to leave?';
};
//*/
//main
//{

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

	//initialize progressbars
	fileProgressDiv.style.display = "none";
	parseProgressDiv.style.display = "none";
	jobsProgressDiv.style.display = "none";

	//file input event
	function readFiles(event) {
		fileProgressDiv.style.display = "";
	    filesToRead = [...document.getElementById("fileInput").files];
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
/*
	    reader.onload = (function(theFile) {
			return function(e) {
				file.content = e.target.result;
			}
		})(file);
		reader.onloadend = (function(){

		})

		// Read in the file
		reader.readAsText(file);
*/
	}

	//trigger next steps
	function afterFileRead(){

		extractLogs();
		analysisTab.style.display = "";
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

		function analysisTableRowDblClicked(e, row){
			console.log(e,row);
			debuggerTab.style.display = "";
			debuggerTab.click();

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
				logsTable.scrollToRow(labels[array[0]['_index']]);
				logsTable.selectRow(labels[array[0]['_index']]);
			}
		}

		function filterUnkown(data, filterParams){
			return !(data.level == "Error" || data.level == "Warning" || data.level == "Information" || data.level == "Trace")
		}

		function donutClick(event, array){
			//sort table
			if(array.length > 0){
				switch(array[0]["_index"]){
					case 0: logsTable.setFilter("level","=","Trace");
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

		if(timelineGraph)
			timelineGraph.destroy();
		let ctx = document.getElementById('timelineGraph')
		timelineGraph = new Chart(ctx, {
		  type: 'line',
		  data: {
		    labels: shortLabels,
		    datasets: [
		    {
		      label: 'Difference From Last Activity',
		      borderColor: 'rgba(216, 86, 4, 1)',
		      backgroundColor: 'rgba(216, 86, 4, .5)',
		      data: diffData,
		    },
		    {
		      label: 'Total Execution Time of Activity',
		      borderColor: 'rgba(232, 141, 20, 1)',
		      backgroundColor: 'rgba(232, 141, 20, .5)',
		      data: totalData,	
		    },
		    {
		      label: 'Sum of Time Differences',
		      borderColor: 'rgba(243, 190, 38, 1)',
		      backgroundColor: 'rgba(243, 190, 38, .5)',
		      borderWIdth: 1,
		      pointRadius: 0.25,
		      pointHitRadius: 0.25,
		      data: timeData,	
		    }
		    ]
		  },
		  options: {
		    maintainAspectRatio: false,
		    onClick: timelineClick,
		  }
		});
		
		if(levelGraph)
			levelGraph.destroy();
		let ctx2 = document.getElementById('levelGraph')
		levelGraph = new Chart(ctx2, {
		  type: 'line',
		  data: {
		    labels: shortLabels,
		    datasets: [
		    {
		      label: 'Unknown',
		      borderColor: 'rgba(173, 27, 2, 1)',
		      backgroundColor: 'rgba(173, 27, 2, .5)',
		      data: unknownData,
		    },
		    {
		      label: 'Error',
		      borderColor: 'rgba(216, 86, 4, 1)',
		      backgroundColor: 'rgba(216, 86, 4, .5)',
		      data: errorData,
		    },
		    {
		      label: 'Warning',
		      borderColor: 'rgba(232, 141, 20, 1)',
		      backgroundColor: 'rgba(232, 141, 20, .5)',
		      data: warningData,	
		    },
		    {
		      label: 'Information',
		      borderColor: 'rgba(243, 190, 38, 1)',
		      backgroundColor: 'rgba(243, 190, 38, .5)',
		      data: informationData,	
		    },
		    {
		      label: 'Trace',
		      borderWIdth: 1,
		      pointRadius: 0.25,
		      pointHitRadius: 0.25,
		      data: traceData,	
		    }
		    ]
		  },
		  options: {
		    maintainAspectRatio: false,
		    onClick: timelineClick,
		  }
		});
		
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

		timelineGraph.resize();
		levelGraph.resize();
		donutChart.resize();

	}

	function createAnalytics(){
		jobsProgressDiv.style.display = "";
		jobsProgress.classList.add('mdl-progress__indeterminate')

		//pair executing and closing logs
		let pairStack = [];
		logs.formatted.map(log=>{
			if(log.activityInfo){
				if(log.activityInfo.State == "Executing"){
					pairStack.push(log)
				}else{
					let start = pairStack.pop();
					let diff = (new Date(log.timeStamp)) - (new Date(start.timeStamp));
					start.totalTime = 0;
					log.totalTime = diff;
					log.startFP = start.fingerprint;
					log.startTS = start.timeStamp;
				}
			}else if(log.level == "Information"){
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
			}else{
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
	
//}

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