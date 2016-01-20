'use strict';

var uploaderApp = angular.module('of.uploader', [])

uploaderApp.factory('ofUploader', ['$q', '$rootScope', function ($q, $rootScope) {

	function uploadFile(fileElementId, uploadUrl, contentType, progress) {
		return $q(function (resolve, reject) {
			//validate input
			if (!file) return reject("Invalid file");
			if (!uploadUrl) return reject("Invalid upload URL");
			if (!contentType) return reject("Invalid content type");
			if (progress == undefined) progress = 0;

			var fileEl = angular.element(document.querySelector("#"+fileElementId));
			if (!fileEl) return reject("Invalid file element");

			var uploadFile = fileEl[0].files[0];
			if (!uploadFile) return reject("No File");

			_uploadFile(uploadFile, uploadUrl, contentType, onProgress, resolve, reject);

			function onProgress(pr) {
				progress = pr;
				$rootScope.$broadcast(fileElementId+"-progress", progress);
			}
		});
	}

	function uploadFileDirectly(file, uploadUrl, contentType, onProgress) {
		return $q(function(resolve, reject) {
			_uploadFile(file, uploadUrl, contentType, onProgress, resolve, reject);
		})
	}

	function _uploadFile(uploadFile, uploadUrl, contentType, onProgress, resolve, reject) {
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
			emitProgress();
		};
		//deal with errors
		xhr.onerror = function (err) {
			progress = 0;
			emitProgress();
			reject("Error Uploading File");
		};
		//on progress upload
		xhr.upload.onprogress = function (e) {
			if (e.lengthComputable) {
				progress = Math.round((e.loaded / e.total) * 100);
				emitProgress();
			}
		};
		function emitProgress() {
			onProgress(progress);
		}
		//set content type
		xhr.setRequestHeader('Content-Type', contentType);
		//start the upload
		xhr.send(uploadFile);
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
		uploadFileFromInput: uploadFile,
		uploadFileDirectly: uploadFileDirectly
	};

}]);
