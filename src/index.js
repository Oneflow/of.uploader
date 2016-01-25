'use strict';

var uploaderApp = angular.module('of.uploader', [])

uploaderApp.factory('ofUploader', ['$q', '$rootScope', function ($q, $rootScope) {

	function uploadFile(fileElementId, uploadUrl, contentType, progress) {
		return $q(function (resolve, reject) {
			//validate input
			if (!fileElementId) return reject("Invalid file input");
			if (!uploadUrl) return reject("Invalid upload URL");
			if (!contentType) return reject("Invalid content type");
			if (progress == undefined) progress = 0;

			var fileEl = angular.element(document.querySelector("#"+fileElementId));
			if (!fileEl) return reject("Invalid file element");

			var uploadFile = fileEl[0].files[0];
			if (!uploadFile) return reject("No File");

			_uploadFile(uploadFile, uploadUrl, contentType, onProgress)
				.then(resolve)
				.catch(reject);

			function onProgress(pr) {
				progress = pr;
				$rootScope.$broadcast(fileElementId+"-progress", progress);
			}
		});
	}

	function uploadFileDirectly(file, uploadUrl, contentType, onProgress) {
		return _uploadFile(file, uploadUrl, contentType, onProgress);
	}

	function _uploadFile(uploadFile, uploadUrl, contentType, onProgress) {
		return $q(function(resolve, reject) {
			var progress = 0;
			//create a request
			var xhr = createCORSRequest(uploadUrl);
			//complete the loading
			xhr.onload = function () {
				if (xhr.status == 200) {
					progress = 100;
					resolve();
				} else {
					progress = 0;
				}
				_onProgress();
			};
			//deal with errors
			xhr.onerror = function (err) {
				progress = 0;
				_onProgress();
				reject("Error Uploading File");
			};
			//on progress upload
			xhr.upload.onprogress = function (e) {
				if (e.lengthComputable) {
					progress = Math.round((e.loaded / e.total) * 100);
					_onProgress();
				}
			};
			function _onProgress() {
				if (onProgress && typeof(onProgress)==='function') {
					onProgress(progress);
				}
			}
			//set content type
			xhr.setRequestHeader('Content-Type', contentType);
			//start the upload
			xhr.send(uploadFile);
		});
	}

	//create a browser compatible CORS upload request
	function createCORSRequest(url) {
		var method = 'PUT';
		var xhr = new XMLHttpRequest();
		if ("withCredentials" in xhr) {
			xhr.open(method, url, true);
		} else if (typeof XDomainRequest != "undefined") {
			xhr = new XDomainRequest();
			xhr.open(method, url);
		} else {
			xhr = null;
		}
		return xhr;
	}

	return {
		uploadFile: uploadFile,
		uploadFileDirectly: uploadFileDirectly
	};

}]);

angular.module('of.uploader').factory('ofUploaderQueue', ['$q', '$http', 'FileUploader', 'ofUploader', function($q, $http, FileUploader, ofUploader) {
	var uploader = new FileUploader();
	var _uploader = {};

	var _onFinishActions = [];
	var _onFileAddActions = [];
	var _onFileChooseActions = [];
	var _onProgressActions = [];

	var _uploadProcessId = 0;

	function _getCurrentProcccessId() {
		return _uploadProcessId;
	}

	function _switchUploadProccess() {
		_uploadProcessId++;
	}

	function _getUrls(mimeType) {
		//TO DO: make provider to determinate this url
		var url = 'http://printbox-api-dev.oneflowcloud.com/api/ez/uploadurls';
		return $http.get(url, {params : {mimeType: mimeType}});
	}

	function prepareFileToDisplay(file) {
		file.name = file._file.name;
		var iconType = 'file';
		var picture = 'assets/images/file-default-picture.png';
		var mimeType = file._file.type;
		var fp = mimeType.split('/')[0];
		var sp = mimeType.split('/')[1];
		if (fp === 'image') {
			iconType = 'image';
			picture = 'assets/images/file-image-picture.png';
		}
		if (fp=='application') {
			if (sp==='pdf') {
				iconType = 'pdf';
				picture = 'assets/images/file-pdf-picture.png';
			}
			if (sp==='x-stuffit' || sp==='zip') {
				iconType = 'archive';
				picture = 'assets/images/file-archive-picture.png';
			}
		}
		file.iconType = iconType;
		file.picture = picture;
	}

	var lastFile = {};
	var queue = [];

	uploader.onAfterAddingFile = function(file) {
		prepareFileToDisplay(file);
		lastFile = file;
		_triggerActions(_onFileChooseActions,file);
	};

	function getLastChoosedFile() {
		return lastFile;
	}

	function getQueue() {
		return queue;
	}

	function addFile() {
		return $q(function(resolve, reject) {
			_getUrls(lastFile._file.type).then(function(res) {
				lastFile.url = res.data.upload;
				lastFile.fetchUrl = res.data.fetch;
				lastFile.progress = 0;
				queue.push(lastFile);
				uploader.queue = queue;
				_triggerActions(_onFileAddActions, lastFile);
				resolve(res.data);
			}).catch(reject);
		});
	}


	function clearQueue() {
		queue = [];
	}

	function uploadAll() {
		_switchUploadProccess();
		_.forEach(queue, function(file) {
			file.uploadProccessId = _getCurrentProcccessId();
			file.onProgress = function(pr) {
				if (this.uploadProccessId === _getCurrentProcccessId()) {
					this.progress = pr;
					_triggerActions(_onProgressActions,getTotalProgress());
				}
			}.bind(file);
			ofUploader.uploadFileDirectly(file._file, file.url, file._file.type, file.onProgress).catch(function(error) {
				console.error('upload error: ', error);
				cancelUploading();
				console.warn('uploading canceled');
			});
		});
	}

	function getTotalProgress() {
		var tp = 0;
		_.forEach(queue, function(f) {
			tp += f.progress;
		});
		tp = Math.round(tp/queue.length);
		if (tp===100) _finishUploading();
		return tp;
	}

	function cancelUploading() {
		_switchUploadProccess();
		_.forEach(queue, function(f) {
			f.progress = 0;
			f.onProgress = null;
		});
		_uploader.onProgress(getTotalProgress());
	}

	function _finishUploading() {
		var files = [];
		_.forEach(queue, function(f) {
			files.push({name: f.name, url: f.fetchUrl});
		});
		_switchUploadProccess();
		_triggerActions(_onFinishActions, files);
	}


	function _triggerActions(actions,args) {
		_.forEach(actions, function(a) {
			if (typeof(a)==='function') a(args);
		});
	}

	_uploader = {
		instance: uploader,
		getQueue: getQueue,
		getLastChoosedFile: getLastChoosedFile,
		addFile: addFile,
		clearQueue: clearQueue,
		uploadAll: uploadAll,
		getTotalProgress: getTotalProgress,
		cancelUploading: cancelUploading,
		onProgress: function(action) {
			_onProgressActions.push(action);
		},
		onFileChoosed: function(action) {
			_onFileChooseActions.push(action);
		},
		onFileAdded: function(action) {
			_onFileAddActions.push(action);
		},
		onUploadFinished: function(action) {
			_onFinishActions.push(action);
		},
		deleteFile: function(id) {
			_.remove(queue,function(f,i) {
				return i===id;
			});
			return queue;
		}
	};

	return _uploader;
}]);

