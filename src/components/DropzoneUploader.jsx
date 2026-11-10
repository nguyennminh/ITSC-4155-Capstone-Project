import React, { forwardRef, useImperativeHandle } from 'react';
import { useDropzone } from 'react-dropzone';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const rejectionMessages = {
  'file-invalid-type': 'Please select a PDF or DOCX file.',
  'file-too-small': 'This file is empty. Please select another file.',
  'file-too-large': 'Your resume must be 10 MB or smaller.',
  'too-many-files': 'Please select one resume at a time.',
};

export default forwardRef(function DropzoneUploader({ onFileAccepted, onError, visible = true }, ref) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    multiple: false,
    minSize: 1,
    maxSize: MAX_FILE_SIZE,
    // Check the extension too, including files with misleading MIME types.
    validator: file => /\.(pdf|docx)$/i.test(file.name)
      ? null : { code: 'file-invalid-type' },
    onDrop(acceptedFiles, rejections) {
      if (rejections.length) {
        const code = rejections[0].errors[0].code;
        onError(rejectionMessages[code] || 'Could not select this resume. Please try another file.');
      } else if (acceptedFiles.length) {
        onError('');
        onFileAccepted(acceptedFiles[0]);
      }
    },
    onError: () => onError('Could not read this resume. Please try another file.'),
    // Use the hidden input consistently for both selection and replacement.
    useFsAccessApi: false,
  });

  useImperativeHandle(ref, () => ({ open }), [open]);

  const input = <input {...getInputProps({
    'aria-label': 'Select your resume',
    'aria-describedby': 'resume-help resume-error',
  })} />;

  if (!visible) return input;

  return (
    <div {...getRootProps({
      className: `resume-dropzone${isDragActive ? ' is-drag-active' : ''}`,
      role: 'button',
      'aria-label': 'Upload resume',
      'aria-describedby': 'resume-help resume-error',
    })}>
      {input}
      <p>{isDragActive ? 'Drop your resume here…' : 'Drag & drop your resume here, or click to select a file'}</p>
    </div>
  );
});
