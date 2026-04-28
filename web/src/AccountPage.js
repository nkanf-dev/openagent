// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {Avatar, Button, Card, Col, Form, Input, Modal, Row, message} from "antd";
import i18next from "i18next";
import * as AccountBackend from "./backend/AccountBackend";
import * as Setting from "./Setting";

class AccountPage extends React.Component {
  constructor(props) {
    super(props);
    this.formRef = React.createRef();
    this.state = {
      avatar: props.account?.avatar ?? "",
      passwordModalVisible: false,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
  }

  onFinish(values) {
    AccountBackend.updateAccount(values)
      .then((res) => {
        if (res.status === "ok") {
          message.success(i18next.t("general:Successfully saved"));
          window.location.reload();
        } else {
          message.error(res.msg);
        }
      })
      .catch((error) => message.error(error.message));
  }

  closePasswordModal() {
    this.setState({
      passwordModalVisible: false,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  }

  setPassword() {
    if (this.state.newPassword !== this.state.confirmPassword) {
      message.error(i18next.t("account:The two passwords that you entered do not match"));
      return;
    }

    const values = this.formRef.current.getFieldsValue();
    AccountBackend.updateAccount({...values, currentPassword: this.state.currentPassword, newPassword: this.state.newPassword})
      .then((res) => {
        if (res.status === "ok") {
          message.success(i18next.t("general:Successfully saved"));
          this.closePasswordModal();
        } else {
          message.error(res.msg);
        }
      })
      .catch((error) => message.error(error.message));
  }

  renderAvatar() {
    const account = this.props.account;
    const avatarUrl = this.state.avatar || "";
    const hasAvatarUrl = avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://") || avatarUrl.startsWith("data:image/");

    if (!hasAvatarUrl) {
      return (
        <Avatar style={{backgroundColor: Setting.getAvatarColor(account.name)}} size={64}>
          {Setting.getShortName(account.name)}
        </Avatar>
      );
    }

    return (
      <Avatar src={avatarUrl} size={64}>
        {Setting.getShortName(account.name)}
      </Avatar>
    );
  }

  renderFormItem(label, tooltip, item) {
    return (
      <Row style={{marginTop: "20px"}}>
        <Col style={{marginTop: "5px"}} span={(Setting.isMobile()) ? 22 : 2}>
          {Setting.getLabel(label, tooltip)} :
        </Col>
        <Col span={22}>
          {item}
        </Col>
      </Row>
    );
  }

  render() {
    const account = this.props.account;

    return (
      <Card size="small" title={
        <div>
          {i18next.t("account:My Account")}&nbsp;&nbsp;&nbsp;&nbsp;
          <Button onClick={() => this.formRef.current.submit()}>{i18next.t("general:Save")}</Button>
        </div>
      } style={(Setting.isMobile()) ? {margin: "5px"} : {}} type="inner">
        <Form
          ref={this.formRef}
          initialValues={{
            username: account.name,
            displayName: account.displayName,
            avatar: account.avatar,
          }}
          onFinish={(values) => this.onFinish(values)}
          onValuesChange={(_, values) => this.setState({avatar: values.avatar ?? ""})}
        >
          {this.renderFormItem(
            i18next.t("general:Name"),
            i18next.t("general:Name - Tooltip"),
            <Form.Item name="username" style={{margin: 0}}>
              <Input disabled placeholder={i18next.t("account:Account ID")} />
            </Form.Item>
          )}
          {this.renderFormItem(
            i18next.t("general:Display name"),
            i18next.t("general:Display name - Tooltip"),
            <Form.Item name="displayName" style={{margin: 0}}>
              <Input placeholder={i18next.t("account:Name shown in OpenAgent")} />
            </Form.Item>
          )}
          {this.renderFormItem(
            i18next.t("general:Avatar"),
            i18next.t("general:Avatar - Tooltip"),
            <Row gutter={10}>
              <Col flex="80px">
                {this.renderAvatar()}
              </Col>
              <Col flex="auto">
                <Form.Item name="avatar" style={{margin: 0}}>
                  <Input placeholder={i18next.t("account:Avatar image URL, optional")} />
                </Form.Item>
              </Col>
            </Row>
          )}
          {this.renderFormItem(
            i18next.t("general:Password"),
            i18next.t("general:Password - Tooltip"),
            <Button type="primary" onClick={() => this.setState({passwordModalVisible: true})}>
              {i18next.t("account:Modify password...")}
            </Button>
          )}
        </Form>
        <Modal
          maskClosable={false}
          title={i18next.t("general:Password")}
          open={this.state.passwordModalVisible}
          okText={i18next.t("account:Set Password")}
          cancelText={i18next.t("general:Cancel")}
          onCancel={() => this.closePasswordModal()}
          onOk={() => this.setPassword()}
          width={600}
        >
          <Col style={{margin: "0px auto 40px auto", width: "100%"}}>
            <Row style={{width: "100%", marginBottom: "20px"}}>
              <Input.Password
                addonBefore={i18next.t("account:Old Password")}
                placeholder={i18next.t("account:Enter current password")}
                value={this.state.currentPassword}
                onChange={e => this.setState({currentPassword: e.target.value})}
              />
            </Row>
            <Row style={{width: "100%", marginBottom: "20px"}}>
              <Input.Password
                addonBefore={i18next.t("account:New password")}
                placeholder={i18next.t("account:Enter new password")}
                value={this.state.newPassword}
                onChange={e => this.setState({newPassword: e.target.value})}
              />
            </Row>
            <Row style={{width: "100%", marginBottom: "20px"}}>
              <Input.Password
                addonBefore={i18next.t("account:Re-enter New")}
                placeholder={i18next.t("account:Confirm new password")}
                value={this.state.confirmPassword}
                onChange={e => this.setState({confirmPassword: e.target.value})}
              />
            </Row>
          </Col>
        </Modal>
      </Card>
    );
  }
}

export default AccountPage;
