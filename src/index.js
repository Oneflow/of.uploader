'use strict';

var uploaderApp = angular.module('of.uploader', []);

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

angular.module('of.uploader').factory('ofUploaderQueue', ['$q', '$http', 'FileUploader', 'ofUploader', 'ofUploaderQueueConfig', function($q, $http, FileUploader, ofUploader, ofUploaderQueueConfig) {
	var uploader = new FileUploader();
	var _uploader = {};

	var _onFinishActions = [];
	var _onFileAddActions = [];
	var _onFilesSelectedActions = [];
	var _onProgressActions = [];
	var _onValidationFailedActions = [];

	var _uploadProcessId = 0;

	function _getCurrentProcccessId() {
		return _uploadProcessId;
	}

	function _switchUploadProccess() {
		_uploadProcessId++;
	}

	function _getUrls(mimeType) {
		var url = ofUploaderQueueConfig.uploadUrlsUrl;
		return $http.get(url, {params : {mimeType: mimeType}});
	}

	function prepareFileToDisplay(file) {
		file.name = file._file.name;
		var iconType = ofUploaderQueueConfig.defaultFileIconType;
		var picture = ofUploaderQueueConfig.defaultFileImage;
		var mimeType = file._file.type;
		for (var i=0; i<ofUploaderQueueConfig.fileTypesImages.length; i++) {
			if (mimeType === ofUploaderQueueConfig.fileTypesImages[i].type) {
				iconType = ofUploaderQueueConfig.fileTypesImages[i].iconType;
				picture = ofUploaderQueueConfig.fileTypesImages[i].img;
			}
		}
		file.iconType = iconType;
		file.picture = picture;
	}

	function _checkFileType(file) {

		var mimeType = file._file.type;
		var ext = file._file.name.split('.').pop();

		for (var i=0; i<ofUploaderQueueConfig.disallowedTypes.length; i++) {
			if (mimeType === ofUploaderQueueConfig.disallowedTypes[i]) {
				return false
			}
		}

		for (var i=0; i<ofUploaderQueueConfig.disallowedExtensions.length; i++) {
			if (ext === ofUploaderQueueConfig.disallowedExtensions[i]) {
				return false
			}
		}

		return true;
	}

	var _fileSelected = false;
	var queue = [];

	var _isConverting = false;

	function _toBinaryConvertCheck(file) {
		return $q(function(resolve, reject) {
			var ext = file._file.name.split('.').pop();
			if (!file._file.type) {
				_isConverting = true;
				var reader = new FileReader();
				reader.onload = function (event) {
					var blob = new Blob([event.target.result], {type: "octet/stream"});
					blob.name = file._file.name;
					file._file = blob;
					_isConverting = false;
					resolve(file);
				};
				reader.onerror = function(error) {
					_isConverting = false;
					reject(error, file);
				};
				reader.readAsArrayBuffer(file._file);
			} else {
				resolve(file);
			}
		});
	}

	uploader.onAfterAddingFile = function() {
		if (uploader.queue && uploader.queue.length)
			_toBinaryConvertCheck(uploader.queue[uploader.queue.length-1]).then(function() {
				_.forEach(uploader.queue, function(file) {
					if (_checkFileType(file)) {
						prepareFileToDisplay(file);
						_fileSelected = true;
					} else {
						var f = uploader.queue[uploader.queue.length-1];
						uploader.queue = uploader.queue.slice(0,uploader.queue.length-1);
						if (!_isConverting)
							_triggerActions(_onValidationFailedActions, f);
					}
				});
				if (!_isConverting)
					_triggerActions(_onFilesSelectedActions, uploader.queue);
			}).catch(function() {
				var f = uploader.queue[uploader.queue.length-1];
				uploader.queue = uploader.queue.slice(0,uploader.queue.length-1);
				_triggerActions(_onValidationFailedActions, f);
			});
	};

	function getLastSelectedFiles() {
		return uploader.queue;
	}

	function getQueue() {
		return queue;
	}

	function addFiles() {
		if (_fileSelected) {
			_.forEach(uploader.queue, function(file) {
				_getUrls(file._file.type).then(function(res) {
					file.url = res.data.upload;
					file.fetchUrl = res.data.fetch;
					file.progress = 0;
					queue.push(file);
					_triggerActions(_onFileAddActions, file);
				});
			});
			_fileSelected = false;
			uploader.queue = [];
		}
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
					_checkProgress();
				}
			}.bind(file);
			ofUploader.uploadFileDirectly(file._file, file.url, file._file.type, file.onProgress).catch(function(error) {
				console.error('upload error: ', error);
				cancelUploading();
				console.warn('uploading canceled');
			});
		});
	}

	function _checkProgress() {
		if (getTotalProgress()===100) _finishUploading();
	}

	function getTotalProgress() {
		var tp = 0;
		if (queue && queue.length) {
			_.forEach(queue, function(f) {
				tp += f.progress;
			});
			tp = Math.round(tp/queue.length);
		}
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
			files.push(angular.copy(f));
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
		getLastSelectedFiles: getLastSelectedFiles,
		addFiles: addFiles,
		clearQueue: clearQueue,
		uploadAll: uploadAll,
		getTotalProgress: getTotalProgress,
		cancelUploading: cancelUploading,
		onProgress: function(action) {
			_onProgressActions.push(action);
		},
		onFilesSelected: function(action) {
			_onFilesSelectedActions.push(action);
		},
		onFileAdded: function(action) {
			_onFileAddActions.push(action);
		},
		onUploadFinished: function(action) {
			_onFinishActions.push(action);
		},
		onValidationFailed: function(action) {
			_onValidationFailedActions.push(action);
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


angular.module('of.uploader').provider('ofUploaderQueueConfig', [function() {
	var getUrlsUrl = 'http://printbox-api-dev.oneflowcloud.com/api/ez/uploadurls';

	var defaultFileImage = 'assets/images/file-default-picture.png';
	var defaultFileIconType = 'iconType';

	var fileTypesImages = [
		{type: 'image/png', img: 'assets/images/file-image-picture.png', iconType: 'image'},
		{type: 'image/jpg', img: 'assets/images/file-image-picture.png', iconType: 'image'},
		{type: 'image/jpeg', img: 'assets/images/file-image-picture.png', iconType: 'image'},
		{type: 'image/gif', img: 'assets/images/file-image-picture.png', iconType: 'image'},
		{type: 'image/tif', img: 'assets/images/file-image-picture.png', iconType: 'image'},
		{type: 'application/pdf', img: 'assets/images/file-pdf-picture.png', iconType: 'pdf'},
		{type: 'application/x-stuffit', img: 'assets/images/file-archive-picture.png', iconType: 'archive'},
		{type: 'application/zip', img: 'assets/images/file-archive-picture.png', iconType: 'archive'}
	];

	var disallowedTypes = [];

	var disallowedExtensions =[
		'exe'
	];

	this.setConfig = function(configObj) {
		getUrlsUrl = configObj.uploadUrlsUrl || getUrlsUrl;
		defaultFileImage = configObj.defaultFileImage || defaultFileImage;
		defaultFileIconType = configObj.defaultFileIconType || defaultFileIconType;
		fileTypesImages = configObj.fileTypesImages || fileTypesImages;
		disallowedTypes = configObj.disallowedTypes || disallowedTypes;
		disallowedExtensions = configObj.disallowedExtensions || disallowedExtensions;
	};

	this.$get = function() {
		return {
			uploadUrlsUrl: getUrlsUrl || 'http://printbox-api-dev.oneflowcloud.com/api/ez/uploadurls',
			defaultFileImage: defaultFileImage || 'assets/images/file-default-picture.png',
			defaultFileIconType: defaultFileIconType || 'file',
			fileTypesImages: fileTypesImages || [],
			disallowedTypes: disallowedTypes || [],
			disallowedExtensions: disallowedExtensions || []
		};
	};
}]);
